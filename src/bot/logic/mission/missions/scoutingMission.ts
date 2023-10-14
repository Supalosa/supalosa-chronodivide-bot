import { GameApi, PlayerData } from "@chronodivide/game-api";
import { ScoutingSquad } from "../../squad/behaviours/scoutingSquad.js";
import { MissionFactory } from "../missionFactories.js";
import { OneTimeMission } from "./oneTimeMission.js";
import { MatchAwareness } from "../../awareness.js";
import { Mission } from "../mission.js";
import { AttackMission } from "./attackMission.js";
import { Squad } from "../../squad/squad.js";

/**
 * A mission that tries to scout around the map with a cheap, fast unit (usually attack dogs)
 */
export class ScoutingMission extends OneTimeMission {
    constructor(uniqueName: string, priority: number) {
        super(uniqueName, priority, () => new ScoutingSquad());
    }
}

const SCOUT_COOLDOWN_TICKS = 300;

export class ScoutingMissionFactory implements MissionFactory<ScoutingMission> {
    constructor(private lastScoutAt: number = -SCOUT_COOLDOWN_TICKS) {}

    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        existingMissions: Mission[]
    ): ScoutingMission[] {
        if (gameApi.getCurrentTick() < this.lastScoutAt + SCOUT_COOLDOWN_TICKS) {
            return [];
        }
        this.lastScoutAt = gameApi.getCurrentTick();
        console.log("create scouting mission!");
        return [new ScoutingMission("globalScout", 100)];
    }

    onMissionFailed(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        failedMission: Mission,
        failureReason: any
    ): ScoutingMission[] {
        if (failedMission instanceof AttackMission) {
            return [new ScoutingMission("globalScout", 100)];
        }
        return [];
    }
}
