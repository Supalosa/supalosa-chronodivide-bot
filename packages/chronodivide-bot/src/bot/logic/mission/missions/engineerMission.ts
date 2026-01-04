import {
    ActionsApi,
    Bot,
    BotContext,
    GameApi,
    GameObjectData,
    OrderType,
    PlayerData,
    SideType,
    SpeedType,
    UnitData,
} from "@chronodivide/game-api";
import { Mission, MissionAction, disbandMission, noop, releaseUnits, requestUnits } from "../mission.js";
import { MissionFactory } from "../missionFactories.js";
import { MatchAwareness } from "../../awareness.js";
import { MissionController } from "../missionController.js";
import { DebugLogger, toPathNode, toVector2 } from "../../common/utils.js";
import { ActionBatcher } from "../actionBatcher.js";
import { getAdjacencyTiles } from "../../building/buildingRules.js";
import { computeAdjacentRect, getAdjacentTiles } from "../../common/tileUtils.js";
import { UnitComposition } from "../../composition/common.js";
import { fail } from "assert";

const CAPTURE_COOLDOWN_TICKS = 30;

enum EngineerMissionState {
    Preparing = 0,
    Capturing = 1,
}

const LOST_ENGINEER = "lost_engineer";
const NO_PATH = "no_path";

/**
 * A mission that tries to send an engineer into a building (e.g. to capture tech building or repair bridge)
 */
export class EngineerMission extends Mission {
    private state = EngineerMissionState.Preparing;
    private lastCaptureAttemptTick = -1;

    constructor(
        uniqueName: string,
        private priority: number,
        private captureTargetId: number,
        private escortLevel: number,
        logger: DebugLogger,
    ) {
        super(uniqueName, logger);
    }

    get targetId() {
        return this.captureTargetId;
    }

    public _onAiUpdate(
        context: BotContext,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction {
        const gameApi = context.game;
        const actionsApi = context.player.actions;
        const playerData = gameApi.getPlayerData(context.player.name);
        const engineers = this.getUnitsOfTypes(gameApi, ...["SENGINEER", "ENGINEER"]);

        const target = gameApi.getGameObjectData(this.captureTargetId);
        if (!target || target.owner === playerData.name) {
            // Target gone or already captured, disband.
            return disbandMission();
        }

        if (engineers.length === 0 && this.state === EngineerMissionState.Capturing) {
            // Engineer died and we already tried to capture
            return disbandMission(LOST_ENGINEER);
        }

        if (this.state === EngineerMissionState.Preparing) {
            const composition: UnitComposition = {};
            switch (playerData.country!.side) {
                case SideType.Nod:
                    composition["SENGINEER"] = 1;
                    composition["DOG"] = Math.max(0, this.escortLevel - 1); // 0, 1, 2
                    composition["HTNK"] = Math.max(0, this.escortLevel - 2); // 0, 0, 1
                    break;
                case SideType.GDI:
                    composition["ENGINEER"] = 1;
                    composition["ADOG"] = Math.max(0, this.escortLevel - 1); // 0, 1, 2
                    composition["MTNK"] = Math.max(0, this.escortLevel - 2); // 0, 0, 1
                    break;
            }
            const missingUnits = this.getMissingUnits(gameApi, composition);
            if (missingUnits.length > 0) {
                return requestUnits(missingUnits.map(([unitName]) => unitName), this.priority);
            }
            this.state = EngineerMissionState.Capturing;
        }
        
        if (this.state === EngineerMissionState.Capturing && gameApi.getCurrentTick() > this.lastCaptureAttemptTick + CAPTURE_COOLDOWN_TICKS) {
            const engineer = engineers[0];
            if (!canReachStructure(gameApi, engineer, target)) {
                return disbandMission(NO_PATH);
            }
            actionsApi.orderUnits([engineer.id], OrderType.Capture, this.captureTargetId);
            const escortUnits = this.getUnitsOfTypes(gameApi, "DOG", "HTNK", "ADOG", "MTNK");
            if (escortUnits.length > 0) {
                actionsApi.orderUnits(escortUnits.map(u => u.id), OrderType.Guard, engineer.id);
            }
            // Add a cooldown to deploy attempts.
            this.lastCaptureAttemptTick = gameApi.getCurrentTick();
        }
        return noop();
    }

    public getGlobalDebugText(): string | undefined {
        return undefined;
    }

    public getPriority() {
        return this.priority;
    }
}

function canReachStructure(gameApi: GameApi, engineer: UnitData, target: GameObjectData) {
    const reachabilityMap = gameApi.map.getReachabilityMap(SpeedType.Foot, true);
    // unfortunately we have to test tiles around the target, because the target blocks pathing
    const range = computeAdjacentRect(toVector2(target.tile), target.foundation, 1);
    const adjacentTiles = getAdjacentTiles(gameApi, range, false);
    for (const tile of adjacentTiles) {
        if (
            reachabilityMap.isReachable(toPathNode(engineer.tile, engineer.onBridge ?? false), toPathNode(tile, false))
        ) {
            return true;
        }
    }
    return false;
}

const TECH_CHECK_INTERVAL_TICKS = 300;
const MAX_CAPTURE_ATTEMPT_COUNT = 3;

export class EngineerMissionFactory implements MissionFactory {
    private lastCheckAt = 0;
    private lostEngineerCounts: { [buildingId: number]: number } = {};
    private noPathCounts: { [buildingId: number]: number } = {};

    getName(): string {
        return "EngineerMissionFactory";
    }

    maybeCreateMissions(
        context: BotContext,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
        const gameApi = context.game;
        const actionsApi = context.player.actions;
        const playerData = gameApi.getPlayerData(context.player.name);
        if (!(gameApi.getCurrentTick() > this.lastCheckAt + TECH_CHECK_INTERVAL_TICKS)) {
            return;
        }
        this.lastCheckAt = gameApi.getCurrentTick();
        const eligibleTechBuildings = gameApi.getVisibleUnits(
            playerData.name,
            "hostile",
            (r) => r.capturable && r.produceCashAmount > 0,
        );

        eligibleTechBuildings.forEach((techBuildingId) => {
            if (this.lostEngineerCounts[techBuildingId] >= MAX_CAPTURE_ATTEMPT_COUNT || this.noPathCounts[techBuildingId] >= MAX_CAPTURE_ATTEMPT_COUNT) {
                return;
            }
            const escortLevel = (this.lostEngineerCounts[techBuildingId] ?? 0) + 1;
            missionController.addMission(
                new EngineerMission("capture-" + techBuildingId, 100, techBuildingId, escortLevel, logger),
            );
        });
    }

    onMissionFailed(
        context: BotContext,
        matchAwareness: MatchAwareness,
        failedMission: Mission<any>,
        failureReason: any,
        missionController: MissionController,
    ): void {
        if (!(failedMission instanceof EngineerMission)) {
            return;
        }
        if (failureReason === LOST_ENGINEER) {
            this.lostEngineerCounts[failedMission.targetId] = (this.lostEngineerCounts[failedMission.targetId] ?? 0) + 1;
        } else if (failureReason === NO_PATH) {
            this.noPathCounts[failedMission.targetId] = (this.noPathCounts[failedMission.targetId] ?? 0) + 1;
        }
    }
}
