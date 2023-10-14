import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { ExpansionMissionFactory } from "./missions/expansionMission.js";
import { Mission } from "./mission.js";
import { MatchAwareness } from "../awareness.js";
import { ScoutingMissionFactory } from "./missions/scoutingMission.js";
import { AttackMissionFactory } from "./missions/attackMission.js";

export interface MissionFactory<T extends Mission<any>> {
    /**
     * Queries the factory for new missions to be spawned.
     *
     * @param gameApi
     * @param playerData
     * @param matchAwareness
     * @param existingMissions
     * @return array of missions that were created by the factory, or an empty array if there are no new missions to create.
     */
    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        existingMissions: Mission[]
    ): T[];

    /**
     * Called when any mission fails - can be used to trigger another mission in response.
     */
    onMissionFailed(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        failedMission: Mission,
        failureReason: any
    ): T[];
}

export const missionFactories = [
    new ExpansionMissionFactory(),
    new ScoutingMissionFactory(),
    new AttackMissionFactory(),
];
