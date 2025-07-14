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

const RESERVE_COUNT = 3;
const RESERVE_PRIORITY = 500;

export class ReserveRhinoMission extends Mission<null> {
    constructor(uniqueName: string, logger: DebugLogger) {
        super(uniqueName, logger);
    }

    getPriority(): number {
        return RESERVE_PRIORITY;
    }

    isUnitsLocked(): boolean {
        return false; // allow other missions to take rhinos; mission just ensures production.
    }

    getGlobalDebugText(): string | undefined {
        return "ReserveRhino";
    }

    _onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction {
        const rhinosOwned = gameApi
            .getVisibleUnits(playerData.name, "self", (r) => r.name === "MTNK").length;
        if (rhinosOwned >= RESERVE_COUNT) {
            return disbandMission();
        }
        const missing = RESERVE_COUNT - rhinosOwned;
        return requestUnits(Array(missing).fill("MTNK"), this.getPriority());
    }
}

export class ReserveRhinoMissionFactory implements MissionFactory {
    private started = false;

    getName() {
        return "ReserveRhinoMissionFactory";
    }

    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
        if (this.started) return;
        // create at tick 0
        const mission = new ReserveRhinoMission("reserveRhino", logger);
        missionController.addMission(mission);
        this.started = true;
    }

    onMissionFailed() {}
} 