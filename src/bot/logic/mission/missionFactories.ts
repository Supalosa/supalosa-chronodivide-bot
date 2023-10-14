import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { ExpansionMissionFactory } from "./missions/expansionMission.js";
import { Mission } from "./mission.js";
import { MatchAwareness } from "../awareness.js";
import { ScoutingMissionFactory } from "./missions/scoutingMission.js";
import { AttackMissionFactory } from "./missions/attackMission.js";
import { MissionController } from "./missionController.js";

export interface MissionFactory {

    getName(): string;

    /**
     * Queries the factory for new missions to be spawned.
     *
     * @param gameApi
     * @param playerData
     * @param matchAwareness
     * @param missionController
     */
    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController
    ): void;

    /**
     * Called when any mission fails - can be used to trigger another mission in response.
     */
    onMissionFailed(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        failedMission: Mission,
        failureReason: any,
        missionController: MissionController
    ): void;
}

export const missionFactories = [
    new ExpansionMissionFactory(),
    new ScoutingMissionFactory(),
    new AttackMissionFactory(),
];
