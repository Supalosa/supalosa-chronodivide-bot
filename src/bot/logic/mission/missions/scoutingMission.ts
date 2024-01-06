import { GameApi, PlayerData } from "@chronodivide/game-api";
import { ScoutingSquad } from "../behaviours/scoutingSquad.js";
import { MissionFactory } from "../missionFactories.js";
import { BasicMission } from "./basicMission.js";
import { MatchAwareness } from "../../awareness.js";
import { Mission } from "../mission.js";
import { AttackMission } from "./attackMission.js";
import { MissionController } from "../missionController.js";
import { DebugLogger } from "../../common/utils.js";

/**
 * A mission that tries to scout around the map with a cheap, fast unit (usually attack dogs)
 */
export class ScoutingMission extends BasicMission<ScoutingSquad> {
    constructor(uniqueName: string, priority: number, logger: DebugLogger) {
        super(uniqueName, priority, new ScoutingSquad(), logger);
    }
}

const SCOUT_COOLDOWN_TICKS = 300;

export class ScoutingMissionFactory implements MissionFactory {
    constructor(private lastScoutAt: number = -SCOUT_COOLDOWN_TICKS) {}

    getName(): string {
        return "ScoutingMissionFactory";
    }

    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
        if (gameApi.getCurrentTick() < this.lastScoutAt + SCOUT_COOLDOWN_TICKS) {
            return;
        }
        if (!matchAwareness.getScoutingManager().hasScoutTargets()) {
            return;
        }
        if (!missionController.addMission(new ScoutingMission("globalScout", 100, logger))) {
            this.lastScoutAt = gameApi.getCurrentTick();
        }
    }

    onMissionFailed(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        failedMission: Mission<any>,
        failureReason: undefined,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
        if (failedMission instanceof AttackMission) {
            missionController.addMission(new ScoutingMission("globalScout", 100, logger));
        }
    }
}
