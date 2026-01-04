import {
    ActionsApi,
    GameApi,
    GameObjectData,
    OrderType,
    PlayerData,
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

const CAPTURE_COOLDOWN_TICKS = 30;

const ENGINEER_TYPES = ["ENGINEER", "SENGINEER"];
const BASIC_ESCORT_TYPES = ["ADOG", "DOG"];
const ADVANCED_ESCORT_TYPES = ["MTNK", "HTNK"];

/**
 * A mission that tries to send an engineer into a building (e.g. to capture tech building or repair bridge)
 */
export class EngineerMission extends Mission {
    private hasAttemptedCaptureWith: {
        unitId: number;
        gameTick: number;
    } | null = null;

    constructor(
        uniqueName: string,
        private priority: number,
        private captureTargetId: number,
        private attemptCount: number,
        logger: DebugLogger,
    ) {
        super(uniqueName, logger);
    }

    get targetId() {
        return this.captureTargetId;
    }

    public _onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction {
        const engineers = this.getUnitsOfTypes(gameApi, ...ENGINEER_TYPES);

        const target = gameApi.getGameObjectData(this.captureTargetId);
        if (!target) {
            return disbandMission();
        }

        if (engineers.length === 0) {
            // Perhaps we deployed already (or the unit was destroyed), end the mission.
            if (this.hasAttemptedCaptureWith !== null) {
                return disbandMission();
            }
            return requestUnits(ENGINEER_TYPES, this.priority);
        } else if (
            !this.hasAttemptedCaptureWith ||
            gameApi.getCurrentTick() > this.hasAttemptedCaptureWith.gameTick + CAPTURE_COOLDOWN_TICKS
        ) {
            const engineer = engineers[0];
            if (!canReachStructure(gameApi, engineer, target)) {
                return disbandMission();
            }
            actionsApi.orderUnits([engineer.id], OrderType.Capture, this.captureTargetId);
            // Add a cooldown to deploy attempts.
            this.hasAttemptedCaptureWith = {
                unitId: engineer.id,
                gameTick: gameApi.getCurrentTick(),
            };
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
    private captureCounts: { [buildingId: number]: number } = {};

    getName(): string {
        return "EngineerMissionFactory";
    }

    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
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
            if (this.captureCounts[techBuildingId] >= MAX_CAPTURE_ATTEMPT_COUNT) {
                return;
            }
            const attempt = (this.captureCounts[techBuildingId] ?? 0) + 1;
            missionController.addMission(
                new EngineerMission("capture-" + techBuildingId, 100, techBuildingId, attempt, logger),
            );
        });
    }

    onMissionFailed(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        failedMission: Mission<any>,
        failureReason: undefined,
        missionController: MissionController,
    ): void {
        if (!(failedMission instanceof EngineerMission)) {
            return;
        }
        this.captureCounts[failedMission.targetId] = (this.captureCounts[failedMission.targetId] ?? 0) + 1;
    }
}
