import { ActionsApi, GameApi, OrderType, PlayerData, Point2D, SideType } from "@chronodivide/game-api";
import { GlobalThreat } from "../../threat/threat.js";
import { Squad } from "../squad.js";
import { SquadAction, SquadBehaviour, disband, noop, requestSpecificUnits, requestUnits } from "../squadBehaviour.js";
import { MatchAwareness } from "../../awareness.js";

const SCOUT_MOVE_COOLDOWN_TICKS = 30;

export class RetreatSquad implements SquadBehaviour {
    private hasRequestedUnits: boolean = false;
    private moveOrderSentAt = 0;

    constructor(
        private unitIds: number[],
        private retreatToPoint: Point2D,
    ) {}

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        squad: Squad,
        matchAwareness: MatchAwareness,
    ): SquadAction {
        if (squad.getUnitIds().length > 0) {
            // Only send the order once we have managed to claim some units.
            actionsApi.orderUnits(squad.getUnitIds(), OrderType.Move, this.retreatToPoint.x, this.retreatToPoint.y);
            if (!this.moveOrderSentAt) {
                this.moveOrderSentAt = gameApi.getCurrentTick();
            }
        }
        if (gameApi.getCurrentTick() > this.moveOrderSentAt + 60) {
            return disband();
        } else {
            return requestSpecificUnits(this.unitIds, 100);
        }
    }
}
