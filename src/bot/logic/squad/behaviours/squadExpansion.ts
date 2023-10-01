import { ActionsApi, GameApi, OrderType, PlayerData, SideType } from "@chronodivide/game-api";
import { GlobalThreat } from "../../threat/threat.js";
import { Squad } from "../squad.js";
import { SquadAction, SquadBehaviour, disband, noop, requestUnits } from "../squadBehaviour.js";

const DEPLOY_COOLDOWN_TICKS = 30;

// Expansion or initial base.
export class SquadExpansion implements SquadBehaviour {
    private hasAttemptedDeployWith: {
        unitId: number;
        gameTick: number;
    } | null = null;

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        squad: Squad,
        threatData: GlobalThreat | undefined
    ): SquadAction {
        let myMcvName = playerData.country?.side == SideType.GDI ? "AMCV" : "SMCV";
        const mcvs = squad.getUnitsOfType(gameApi, myMcvName);
        if (mcvs.length === 0) {
            // Perhaps we deployed already (or the unit was destroyed), end the mission.
            if (this.hasAttemptedDeployWith !== null) {
                return disband();
            }
            // We need an mcv!
            return requestUnits(myMcvName, 100);
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
