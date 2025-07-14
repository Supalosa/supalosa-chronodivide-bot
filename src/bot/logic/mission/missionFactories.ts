import { GameApi, PlayerData } from "@chronodivide/game-api";
import { ExpansionMissionFactory } from "./missions/expansionMission.js";
import { Mission } from "./mission.js";
import { MatchAwareness } from "../awareness.js";
import { ScoutingMissionFactory } from "./missions/scoutingMission.js";
import { AttackMissionFactory } from "./missions/attackMission.js";
import { MissionController } from "./missionController.js";
import { DefenceMissionFactory } from "./missions/defenceMission.js";
import { DebugLogger } from "../common/utils.js";
import { EngineerMissionFactory } from "./missions/engineerMission.js";
import { NavalScoutingMissionFactory } from "./missions/navalScoutingMission.js";
import { AmphibiousScoutingMissionFactory } from "./missions/amphibiousScoutingMission.js";
import { AntiShipyardMissionFactory } from "./missions/antiShipyardMission.js";
import { AntiCoastShipMissionFactory } from "./missions/antiCoastShipMission.js";
import { AntiSubMissionFactory } from "./missions/antiSubMission.js";
import { ReserveRhinoMissionFactory } from "./missions/reserveRhinoMission.js";
import { DreadEscortMissionFactory } from "./missions/dreadEscortMission.js";

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

export const createMissionFactories = () => [
    new ExpansionMissionFactory(),
    new ScoutingMissionFactory(),
    new AttackMissionFactory(),
    new DefenceMissionFactory(),
    new EngineerMissionFactory(),
    new NavalScoutingMissionFactory(),
    new AmphibiousScoutingMissionFactory(),
    new AntiShipyardMissionFactory(),
    new AntiCoastShipMissionFactory(),
    new AntiSubMissionFactory(),
    new ReserveRhinoMissionFactory(),
    new DreadEscortMissionFactory(),
];
