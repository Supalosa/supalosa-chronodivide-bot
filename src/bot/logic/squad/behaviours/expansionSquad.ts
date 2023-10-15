import { ActionsApi, GameApi, OrderType, PlayerData, SideType } from "@chronodivide/game-api";
import { GlobalThreat } from "../../threat/threat.js";
import { Squad } from "../squad.js";
import { SquadAction, SquadBehaviour, disband, noop, requestSpecificUnits, requestUnits } from "../squadBehaviour.js";
import { MatchAwareness } from "../../awareness.js";

const DEPLOY_COOLDOWN_TICKS = 30;

// Expansion or initial base.
export class ExpansionSquad implements SquadBehaviour {
    private hasAttemptedDeployWith: {
        unitId: number;
        gameTick: number;
    } | null = null;

    /**
     * @param selectedMcv ID of the MCV to try to expand with. If that unit dies, the squad will disband. If no value is provided,
     * the mission requests an MCV.
     */
    constructor(private selectedMcv: number | null) {
    };

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        squad: Squad,
        matchAwareness: MatchAwareness
    ): SquadAction {
        const mcvTypes = ["AMCV", "SMCV"];
        const mcvs = squad.getUnitsOfTypes(gameApi, ...mcvTypes);
        if (mcvs.length === 0) {
            // Perhaps we deployed already (or the unit was destroyed), end the mission.
            if (this.hasAttemptedDeployWith !== null) {
                return disband();
            }
            // We need an mcv!
            if (this.selectedMcv) {
                return requestSpecificUnits([this.selectedMcv], 100);
            } else {
                return requestUnits(mcvTypes, 100);
            }
        } else if (
            !this.hasAttemptedDeployWith ||
            gameApi.getCurrentTick() > this.hasAttemptedDeployWith.gameTick + DEPLOY_COOLDOWN_TICKS
        ) {
            actionsApi.orderUnits(
                mcvs.map((mcv) => mcv.id),
                OrderType.DeploySelected
            );
            // Add a cooldown to deploy attempts.
            this.hasAttemptedDeployWith = {
                unitId: mcvs[0].id,
                gameTick: gameApi.getCurrentTick(),
            };
        }
        return noop();
    }
}
