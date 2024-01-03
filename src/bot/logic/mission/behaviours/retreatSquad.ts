import { ActionsApi, GameApi, OrderType, PlayerData, Vector2 } from "@chronodivide/game-api";
import { MatchAwareness } from "../../awareness.js";
import { ActionBatcher } from "../actionBatcher.js";
import { MissionBehaviour } from "../missions/missionBehaviour.js";
import { Mission, MissionAction, disbandMission, requestSpecificUnits } from "../mission.js";

const SCOUT_MOVE_COOLDOWN_TICKS = 30;

export class RetreatSquad implements MissionBehaviour {
    private createdAt: number | null = null;

    constructor(
        private unitIds: number[],
        private retreatToPoint: Vector2,
    ) {}

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        actionBatcher: ActionBatcher,
        playerData: PlayerData,
        mission: Mission<RetreatSquad>,
        matchAwareness: MatchAwareness,
    ): MissionAction {
        if (!this.createdAt) {
            this.createdAt = gameApi.getCurrentTick();
        }
        if (mission.getUnitIds().length > 0) {
            // Only send the order once we have managed to claim some units.
            actionsApi.orderUnits(
                mission.getUnitIds(),
                OrderType.AttackMove,
                this.retreatToPoint.x,
                this.retreatToPoint.y,
            );
            return disbandMission();
        }
        if (this.createdAt && gameApi.getCurrentTick() > this.createdAt + 240) {
            // Disband automatically after 240 ticks in case we couldn't actually claim any units.
            return disbandMission();
        } else {
            return requestSpecificUnits(this.unitIds, 1000);
        }
    }

    public getGlobalDebugText(): string | undefined {
        return undefined;
    }
}
