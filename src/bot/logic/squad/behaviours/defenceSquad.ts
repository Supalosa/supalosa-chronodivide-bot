import _ from "lodash";
import {
    ActionsApi,
    AttackState,
    GameApi,
    OrderType,
    PlayerData,
    Point2D,
    SideType,
    UnitData,
} from "@chronodivide/game-api";
import { GlobalThreat } from "../../threat/threat.js";
import { Squad } from "../squad.js";
import { SquadAction, SquadBehaviour, disband, grabCombatants, noop, requestUnits } from "../squadBehaviour.js";
import { MatchAwareness } from "../../awareness.js";
import { getDistanceBetween, getDistanceBetweenPoints, getDistanceBetweenUnits } from "../../map/map.js";
import { manageAttackMicro } from "./common.js";

// If no enemies are seen in a circle IDLE_CHECK_RADIUS*radius for IDLE_COOLDOWN_TICKS ticks, the mission is disbanded.
const IDLE_CHECK_RADIUS_RATIO = 2;
const IDLE_COOLDOWN_TICKS = 15 * 30;

const GRAB_RADIUS = 2;

export class DefenceSquad implements SquadBehaviour {
    private lastIdleCheck: number | null = null;

    constructor(
        private defenceArea: Point2D,
        private radius: number,
    ) {}

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        squad: Squad,
        matchAwareness: MatchAwareness,
    ): SquadAction {
        const enemyUnits = gameApi.getVisibleUnits(playerData.name, "hostile", (r) => r.isSelectableCombatant);
        const hasEnemiesInIdleCheckRadius = enemyUnits
            .map((unitId) => gameApi.getUnitData(unitId))
            .some(
                (unit) =>
                    !!unit &&
                    unit.tile &&
                    getDistanceBetween(unit, this.defenceArea) < IDLE_CHECK_RADIUS_RATIO * this.radius,
            );

        if (this.lastIdleCheck === null) {
            this.lastIdleCheck = gameApi.getCurrentTick();
        } else if (
            !hasEnemiesInIdleCheckRadius &&
            gameApi.getCurrentTick() > this.lastIdleCheck + IDLE_COOLDOWN_TICKS
        ) {
            return disband();
        }
        const enemiesInRadius = enemyUnits
            .map((unitId) => gameApi.getUnitData(unitId))
            .filter((unit) => !!unit && unit.tile && getDistanceBetween(unit, this.defenceArea) < this.radius)
            .map((unit) => unit!);
        const defenders = squad.getUnitsMatching(gameApi, (r) => r.rules.isSelectableCombatant);

        defenders.forEach((defender) => {
            // Find closest attacking unit
            if (defender.isIdle) {
                const closestEnemy = _.minBy(
                    enemiesInRadius.map((enemy) => ({
                        enemy,
                        distance: getDistanceBetweenUnits(defender, enemy),
                    })),
                    "distance",
                );
                if (closestEnemy) {
                    manageAttackMicro(actionsApi, defender, closestEnemy.enemy);
                }
            }
        });

        return grabCombatants(this.defenceArea, this.radius * GRAB_RADIUS);
    }
}
