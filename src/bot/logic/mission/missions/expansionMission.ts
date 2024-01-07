import { GameApi, PlayerData } from "@chronodivide/game-api";
import { Mission } from "../mission.js";
import { ExpansionSquad } from "../behaviours/expansionSquad.js";
import { MissionFactory } from "../missionFactories.js";
import { BasicMission } from "./basicMission.js";
import { MatchAwareness } from "../../awareness.js";
import { MissionController } from "../missionController.js";
import { DebugLogger } from "../../common/utils.js";

/**
 * A mission that tries to create an MCV (if it doesn't exist) and deploy it somewhere it can be deployed.
 */
export class ExpansionMission extends BasicMission<ExpansionSquad> {
    constructor(uniqueName: string, priority: number, selectedMcv: number | null, logger: DebugLogger) {
        super(uniqueName, new ExpansionSquad(selectedMcv, priority), logger);
    }
}

export class ExpansionMissionFactory implements MissionFactory {
    getName(): string {
        return "ExpansionMissionFactory";
    }

    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
        // At this point, only expand if we have a loose MCV.
        const mcvs = gameApi.getVisibleUnits(playerData.name, "self", (r) =>
            gameApi.getGeneralRules().baseUnit.includes(r.name),
        );
        mcvs.forEach((mcv) => {
            missionController.addMission(new ExpansionMission("expand-with-" + mcv, 100, mcv, logger));
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
