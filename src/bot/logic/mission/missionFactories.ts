import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { ExpansionMissionFactory } from "./missions/expansionMission.js";
import { Mission } from "./mission.js";
import { MatchAwareness } from "../awareness.js";

export interface MissionFactory {
    /**
     * Queries the factory for new missions to be spawned.
     * 
     * @param gameApi 
     * @param playerData 
     * @param matchAwareness 
     * @param existingMissions 
     * @return array of missions that were created by the factory, or an empty array if there are no new missions to create.
     */
    maybeCreateMission(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        existingMissions: Mission[]
    ): Mission[];
}

export const missionFactories = [new ExpansionMissionFactory()];
