import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { ExpansionMissionFactory } from "./expansionMission.js";
import { Mission } from "./mission.js";

export interface MissionFactory {
    // Potentially return a new mission.
    maybeCreateMission(
        gameApi: GameApi,
        playerData: PlayerData,
        threatData: GlobalThreat,
        existingMissions: Mission[]
    ): Mission | null;
}

export const missionFactories = [new ExpansionMissionFactory()];
