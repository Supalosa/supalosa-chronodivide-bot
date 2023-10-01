import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../../threat/threat.js";
import { Mission } from "../mission.js";
import { ExpansionSquad } from "../../squad/behaviours/expansionSquad.js";
import { MissionFactory } from "../missionFactories.js";
import { OneTimeMission } from "./oneTimeMission.js";

/**
 * A mission that tries to create an MCV (if it doesn't exist) and deploy it somewhere it can be deployed.
 */
export class ExpansionMission extends OneTimeMission {
    constructor(uniqueName: string, priority: number) {
        super(uniqueName, priority, () => new ExpansionSquad());
    }
}

export class ExpansionMissionFactory implements MissionFactory {
    maybeCreateMission(
        gameApi: GameApi,
        playerData: PlayerData,
        threatData: GlobalThreat | null,
        existingMissions: Mission[]
    ): Mission | null {
        // No auto-expansion missions.
        return null;
    }
}
