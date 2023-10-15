import { ActionsApi, GameApi, OrderType, PlayerData, Point2D, SideType } from "@chronodivide/game-api";
import { GlobalThreat } from "../../threat/threat.js";
import { Squad } from "../squad.js";
import { SquadAction, SquadBehaviour, disband, noop, requestUnits } from "../squadBehaviour.js";
import { MatchAwareness } from "../../awareness.js";
import { getUnseenStartingLocations } from "../../common/scout.js";

const SCOUT_MOVE_COOLDOWN_TICKS = 30;

export class ScoutingSquad implements SquadBehaviour {
    private scoutingWith: {
        unitId: number;
        gameTick: number;
    } | null = null;

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        squad: Squad,
        matchAwareness: MatchAwareness,
    ): SquadAction {
        const scoutNames = ["ADOG", "DOG", "E1", "E2", "FV", "HTK"];
        const scouts = squad.getUnitsOfTypes(gameApi, ...scoutNames);

        if ((matchAwareness.getSectorCache().getOverallVisibility() || 0) > 0.9) {
            return disband();
        }

        if (scouts.length === 0) {
            this.scoutingWith = null;
            return requestUnits(scoutNames, 100);
        } else if (
            !this.scoutingWith ||
            gameApi.getCurrentTick() > this.scoutingWith.gameTick + SCOUT_MOVE_COOLDOWN_TICKS
        ) {
            const candidatePoints = getUnseenStartingLocations(gameApi, playerData);
            scouts.forEach((unit) => {
                if (candidatePoints.length > 0) {
                    if (unit?.isIdle) {
                        const scoutLocation =
                            candidatePoints[Math.floor(gameApi.generateRandom() * candidatePoints.length)];
                        actionsApi.orderUnits([unit.id], OrderType.AttackMove, scoutLocation.x, scoutLocation.y);
                    }
                }
            });

            // Add a cooldown to scout attempts.
            this.scoutingWith = {
                unitId: scouts[0].id,
                gameTick: gameApi.getCurrentTick(),
            };
        }
        return noop();
    }
}
