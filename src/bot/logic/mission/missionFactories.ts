import { GameApi, PlayerData, ProductionApi } from "@chronodivide/game-api";
import { ExpansionMissionFactory } from "./missions/expansionMission.js";
import { Mission } from "./mission.js";
import { MatchAwareness } from "../awareness.js";
import { ScoutingMissionFactory } from "./missions/scoutingMission.js";
import { DynamicAttackMissionFactory } from "./missions/attackMission.js";
import { MissionController } from "./missionController.js";
import { DefenceMissionFactory } from "./missions/defenceMission.js";
import { DebugLogger } from "../common/utils.js";
import { EngineerMissionFactory } from "./missions/engineerMission.js";

export interface MissionFactory {
    getName(): string;

    /**
     * Queries the factory for new missions to be spawned.
     *
     * @param gameApi
     * @param productionApi
     * @param playerData
     * @param matchAwareness
     * @param missionController
     */
    maybeCreateMissions(
        gameApi: GameApi,
        productionApi: ProductionApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
        logger: DebugLogger,
    ): void;

    /**
     * Called when any mission fails - can be used to trigger another mission in response.
     */
    onMissionFailed(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        failedMission: Mission<any>,
        failureReason: any,
        missionController: MissionController,
        logger: DebugLogger,
    ): void;
}

export const createBaseMissionFactories = () => [
    new ExpansionMissionFactory(),
    new ScoutingMissionFactory(),
    new DefenceMissionFactory(),
    new EngineerMissionFactory(),
];
