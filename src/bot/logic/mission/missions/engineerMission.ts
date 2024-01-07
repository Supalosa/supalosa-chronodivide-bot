import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../../threat/threat.js";
import { Mission } from "../mission.js";
import { ExpansionSquad } from "../behaviours/expansionSquad.js";
import { MissionFactory } from "../missionFactories.js";
import { BasicMission } from "./basicMission.js";
import { MatchAwareness } from "../../awareness.js";
import { MissionController } from "../missionController.js";
import { DebugLogger } from "../../common/utils.js";
import { EngineerSquad } from "../behaviours/engineerSquad.js";

/**
 * A mission that tries to send an engineer into a building (e.g. to capture tech building or repair bridge)
 */
export class EngineerMission extends BasicMission<EngineerSquad> {
    constructor(uniqueName: string, priority: number, selectedTechBuilding: number, logger: DebugLogger) {
        super(uniqueName, new EngineerSquad(selectedTechBuilding, priority), logger);
    }
}

// Only try to capture tech buildings within this radius of the starting point.
const MAX_TECH_CAPTURE_RADIUS = 50;

const TECH_CHECK_INTERVAL_TICKS = 300;

export class EngineerMissionFactory implements MissionFactory {
    private lastCheckAt = 0;

    getName(): string {
        return "EngineerMissionFactory";
    }

    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
        if (!(gameApi.getCurrentTick() > this.lastCheckAt + TECH_CHECK_INTERVAL_TICKS)) {
            return;
        }
        this.lastCheckAt = gameApi.getCurrentTick();
        const eligibleTechBuildings = gameApi.getVisibleUnits(
            playerData.name,
            "hostile",
            (r) => r.capturable && r.produceCashAmount > 0,
        );

        eligibleTechBuildings.forEach((techBuildingId) => {
            missionController.addMission(new EngineerMission("capture-" + techBuildingId, 100, techBuildingId, logger));
        });
    }

    onMissionFailed(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        failedMission: Mission<any>,
        failureReason: undefined,
        missionController: MissionController,
    ): void {}
}
