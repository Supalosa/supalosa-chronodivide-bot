import _ from "lodash";
import {
    ActionsApi,
    AttackState,
    GameApi,
    ObjectType,
    OrderType,
    PlayerData,
    Point2D,
    SideType,
    UnitData,
} from "@chronodivide/game-api";
import { Squad } from "../squad.js";
import { SquadAction, SquadBehaviour, disband, grabCombatants, noop, requestUnits } from "../squadBehaviour.js";
import { MatchAwareness } from "../../awareness.js";
import { getDistanceBetween, getDistanceBetweenPoints, getDistanceBetweenUnits } from "../../map/map.js";
import { AttackTarget } from "../../mission/missions/attackMission.js";

// If no enemies are seen in a circle IDLE_CHECK_RADIUS*radius for IDLE_COOLDOWN_TICKS ticks, the mission is disbanded.
const IDLE_CHECK_RADIUS_RATIO = 2;
const IDLE_COOLDOWN_TICKS = 15 * 30;

const GRAB_RADIUS = 4;

export class AttackSquad implements SquadBehaviour {
    private lastIdleCheck: number | null = null;

    constructor(private rallyArea: Point2D, private attackArea: AttackTarget, private radius: number) {}

    private isHostileUnit(game: GameApi, unitId: number, playerData: PlayerData) {
        const unitData = game.getUnitData(unitId);
        if (!unitData) {
            return false;
        }

        return unitData.owner != playerData.name && game.getPlayerData(unitData.owner)?.isCombatant;
    }

    public setAttackArea(attackArea: AttackTarget) {
        this.attackArea = attackArea;
    }

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        squad: Squad,
        matchAwareness: MatchAwareness
    ): SquadAction {
        const defenders = squad.getUnitsMatching(gameApi, (r) => r.rules.isSelectableCombatant);
        const enemyUnits = gameApi.getVisibleUnits(playerData.name, "hostile", (r) => r.isSelectableCombatant);

        if (enemyUnits.length > 0) {
            const weightedTargets = enemyUnits
                // TODO is this necessary?
                .filter((unit) => this.isHostileUnit(gameApi, unit, playerData))
                .map((unitId) => {
                    let unit = gameApi.getUnitData(unitId);
                    return {
                        unit: unit!,
                        unitId: unitId,
                        weight: getDistanceBetweenPoints(this.attackArea || playerData.startLocation, {
                            x: unit!.tile.rx,
                            y: unit!.tile.rx,
                        }),
                    };
                })
                .filter((unit) => unit.unit != null);
            weightedTargets.sort((targetA, targetB) => {
                return targetA.weight - targetB.weight;
            });
            const target = weightedTargets.find((_) => true);
            if (target !== undefined) {
                for (const defender of defenders) {
                    if (defender.isIdle) {
                        const distance = getDistanceBetweenUnits(defender, target.unit);
                        this.manageMicro(actionsApi, defender, target.unit, distance);
                    }
                }
            }
        }
        return grabCombatants(this.rallyArea, this.radius * GRAB_RADIUS);
    }

    // Micro methods
    private manageMicro(actionsApi: ActionsApi, defender: UnitData, target: UnitData, distance: number) {
        if (defender.name === "E1") {
            // Para (deployed weapon) range is 5.
            if (defender.canMove && distance <= 4) {
                actionsApi.orderUnits([defender.id], OrderType.DeploySelected);
            } else if (!defender.canMove && distance >= 5) {
                actionsApi.orderUnits([defender.id], OrderType.DeploySelected);
            }
            return;
        }
        let targetData = target;
        let orderType: OrderType = OrderType.AttackMove;
        if (targetData?.type == ObjectType.Building) {
            orderType = OrderType.Attack;
        } else if (targetData?.rules.canDisguise) {
            // Special case for mirage tank/spy as otherwise they just sit next to it.
            orderType = OrderType.Attack;
        }
        actionsApi.orderUnits([defender.id], orderType, target.id);
    }
}
