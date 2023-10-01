import { ActionsApi, GameApi, OrderType, PlayerData, Point2D, SideType } from "@chronodivide/game-api";
import { GlobalThreat } from "../../threat/threat.js";
import { Squad } from "../squad.js";
import { SquadAction, SquadBehaviour, disband, noop, requestUnits } from "../squadBehaviour.js";

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
        threatData: GlobalThreat | null
    ): SquadAction {
        // Use any of these as scouts, but only request dogs to be trained as scouts.
        const scoutNames = ["ADOG", "DOG", "E1", "E2", "FV", "HTK"];
        let dogName = playerData.country?.side == SideType.GDI ? "ADOG" : "DOG";
        const scouts = squad.getUnitsOfTypes(gameApi, ...scoutNames);
        if (scouts.length === 0) {
            this.scoutingWith = null;
            return requestUnits(dogName, 100);
        } else if (
            !this.scoutingWith ||
            gameApi.getCurrentTick() > this.scoutingWith.gameTick + SCOUT_MOVE_COOLDOWN_TICKS
        ) {
            let candidatePoints: Point2D[] = [];

            // Move to an unseen starting location.
            const unseenStartingLocations = gameApi.mapApi.getStartingLocations().filter((startingLocation) => {
                if (startingLocation == playerData.startLocation) {
                    return false;
                }
                let tile = gameApi.mapApi.getTile(startingLocation.x, startingLocation.y);
                return tile ? !gameApi.mapApi.isVisibleTile(tile, playerData.name) : false;
            });
            candidatePoints.push(...unseenStartingLocations);

            scouts.forEach((unit) => {
                if (candidatePoints.length > 0) {
                    if (unit?.isIdle) {
                        const scoutLocation =
                            candidatePoints[Math.floor(gameApi.generateRandom() * candidatePoints.length)];
                        actionsApi.orderUnits([unit.id], OrderType.AttackMove, scoutLocation.x, scoutLocation.y);
                    }
                }
            });

            actionsApi.orderUnits(
                scouts.map((mcv) => mcv.id),
                OrderType.DeploySelected
            );
            // Add a cooldown to scout attempts.
            this.scoutingWith = {
                unitId: scouts[0].id,
                gameTick: gameApi.getCurrentTick(),
            };
        }
        return noop();
    }
}
