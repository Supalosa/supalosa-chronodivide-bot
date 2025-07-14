import {
    ActionsApi,
    GameApi,
    OrderType,
    PlayerData,
    Vector2,
} from "@chronodivide/game-api";
import { Mission, MissionAction, requestUnits, noop, disbandMission } from "../mission.js";
import { ActionBatcher } from "../actionBatcher.js";
import { MatchAwareness } from "../../awareness.js";
import { DebugLogger, countBy } from "../../common/utils.js";
import { MissionFactory } from "../missionFactories.js";
import { MissionController } from "../missionController.js";
import { pushToPointSafe } from "../../common/navalUtils.js";

const ESCORT_SUB_COUNT = 3;
const ESCORT_PRIORITY = 400;

/**
 * A mission that ensures each Dreadnought (DRED) has a personal escort of 3 Submarines (SUB).
 */
export class DreadEscortMission extends Mission<null> {
    private readonly dreadId: number;

    constructor(uniqueName: string, dreadId: number, private loggerCtx: DebugLogger) {
        super(uniqueName, loggerCtx);
        this.dreadId = dreadId;
    }

    getDreadId() {
        return this.dreadId;
    }

    getPriority(): number {
        return ESCORT_PRIORITY;
    }

    // Allow higher priority missions to steal subs if needed, but default keeps them.
    isUnitsLocked(): boolean {
        return true; // lock escort units so they stay with the dreadnought
    }

    getGlobalDebugText(): string | undefined {
        return `Escort→DRED#${this.dreadId}`;
    }

    _onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction {
        const dread = gameApi.getUnitData(this.dreadId);
        if (!dread) {
            // Dreadnought destroyed – mission ends.
            return disbandMission();
        }

        // Ensure required submarines are present.
        const currentComp = countBy(this.getUnitsGameObjectData(gameApi), (u) => u.name);
        const subCount = currentComp["SUB"] || 0;
        if (subCount < ESCORT_SUB_COUNT) {
            const missing = ESCORT_SUB_COUNT - subCount;
            // Request additional subs.
            return requestUnits(Array(missing).fill("SUB"), this.getPriority());
        }

        // Follow the dreadnought – order submarines to AttackMove towards the dread's current tile.
        const dest = new Vector2(dread.tile.rx, dread.tile.ry);
        this.getUnits(gameApi).forEach((unit) => {
            pushToPointSafe(gameApi, actionBatcher, unit.id, OrderType.AttackMove, dest);
        });
        return noop();
    }
}

export class DreadEscortMissionFactory implements MissionFactory {
    getName() {
        return "DreadEscortMissionFactory";
    }

    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
        // Find all visible friendly dreadnoughts.
        const dreadIds = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "DRED");
        if (dreadIds.length === 0) return;

        // For each dread, ensure an escort mission exists.
        dreadIds.forEach((dreadId) => {
            const exists = missionController
                .getMissions()
                .some(
                    (m): m is DreadEscortMission => m instanceof DreadEscortMission && m.getDreadId() === dreadId,
                );
            if (!exists) {
                const mission = new DreadEscortMission(`escortDred_${dreadId}`, dreadId, logger);
                missionController.addMission(mission);
            }
        });
    }

    onMissionFailed() {
        // No special handling
    }
} 