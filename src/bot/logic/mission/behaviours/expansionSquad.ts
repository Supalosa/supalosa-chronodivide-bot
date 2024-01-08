import { ActionsApi, GameApi, OrderType, PlayerData } from "@chronodivide/game-api";
import { MatchAwareness } from "../../awareness.js";
import { ActionBatcher } from "../actionBatcher.js";
import { MissionBehaviour } from "../missions/missionBehaviour.js";
import { Mission, MissionAction, disbandMission, noop, requestSpecificUnits, requestUnits } from "../mission.js";

const DEPLOY_COOLDOWN_TICKS = 30;

// Expansion or initial base.
export class ExpansionSquad implements MissionBehaviour {
    private hasAttemptedDeployWith: {
        unitId: number;
        gameTick: number;
    } | null = null;

    /**
     * @param selectedMcv ID of the MCV to try to expand with. If that unit dies, the squad will disband. If no value is provided,
     * the mission requests an MCV.
     */
    constructor(
        private selectedMcv: number | null,
        private priority: number,
    ) {}

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        actionBatcher: ActionBatcher,
        playerData: PlayerData,
        mission: Mission<ExpansionSquad>,
        matchAwareness: MatchAwareness,
    ): MissionAction {
        const mcvTypes = ["AMCV", "SMCV"];
        const mcvs = mission.getUnitsOfTypes(gameApi, ...mcvTypes);
        if (mcvs.length === 0) {
            // Perhaps we deployed already (or the unit was destroyed), end the mission.
            if (this.hasAttemptedDeployWith !== null) {
                return disbandMission();
            }
            // We need an mcv!
            if (this.selectedMcv) {
                return requestSpecificUnits([this.selectedMcv], this.priority);
            } else {
                return requestUnits(mcvTypes, this.priority);
            }
        } else if (
            !this.hasAttemptedDeployWith ||
            gameApi.getCurrentTick() > this.hasAttemptedDeployWith.gameTick + DEPLOY_COOLDOWN_TICKS
        ) {
            actionsApi.orderUnits(
                mcvs.map((mcv) => mcv.id),
                OrderType.DeploySelected,
            );
            // Add a cooldown to deploy attempts.
            this.hasAttemptedDeployWith = {
                unitId: mcvs[0].id,
                gameTick: gameApi.getCurrentTick(),
            };
        }
        return noop();
    }

    public getGlobalDebugText(): string | undefined {
        return undefined;
    }
}
