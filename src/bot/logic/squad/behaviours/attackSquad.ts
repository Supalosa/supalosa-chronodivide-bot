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
import { match } from "assert";

// If no enemies are seen in a circle IDLE_CHECK_RADIUS*radius for IDLE_COOLDOWN_TICKS ticks, the mission is disbanded.
const IDLE_CHECK_RADIUS_RATIO = 2;
const IDLE_COOLDOWN_TICKS = 15 * 30;

const TARGET_UPDATE_INTERVAL_TICKS = 4;
const GRAB_INTERVAL_TICKS = 10;

const GRAB_RADIUS = 30;

export class AttackSquad implements SquadBehaviour {
    private lastIdleCheck: number | null = null;
    private lastGrab: number | null = null;
    private lastCommand: number | null = null;

    constructor(
        private rallyArea: Point2D,
        private attackArea: AttackTarget,
        private radius: number,
    ) {}

    public setAttackArea(attackArea: AttackTarget) {
        this.attackArea = attackArea;
    }

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        squad: Squad,
        matchAwareness: MatchAwareness,
    ): SquadAction {
        if (!this.lastCommand || gameApi.getCurrentTick() > this.lastCommand + TARGET_UPDATE_INTERVAL_TICKS) {
            const units = squad.getUnitsMatching(gameApi, (r) => r.rules.isSelectableCombatant);

            const attackPoint = this.attackArea || playerData.startLocation;

            for (const attacker of units) {
                if (attacker.isIdle) {
                    const { rx: x, ry: y } = attacker.tile;
                    const range = attacker.primaryWeapon?.maxRange ?? attacker.secondaryWeapon?.maxRange ?? 5;
                    const nearbyHostiles = matchAwareness.getHostilesInRadius2(x, y, range * 2);
                    const closest = _.minBy(nearbyHostiles, ({ x: hX, y: hY }) =>
                        getDistanceBetweenPoints({ x, y }, { x: hX, y: hY }),
                    );
                    const closestUnit = closest ? gameApi.getUnitData(closest.unitId) ?? null : null;
                    if (closestUnit) {
                        this.manageAttackMicro(actionsApi, attacker, closestUnit);
                    } else {
                        this.manageMoveMicro(actionsApi, attacker, attackPoint);
                    }
                }
            }
            this.lastCommand = gameApi.getCurrentTick();
        }
        if (!this.lastGrab || gameApi.getCurrentTick() > this.lastGrab + GRAB_INTERVAL_TICKS) {
            this.lastGrab = gameApi.getCurrentTick();
            return grabCombatants(this.rallyArea, this.radius * GRAB_RADIUS);
        } else {
            return noop();
        }
    }

    // Micro methods
    private manageMoveMicro(actionsApi: ActionsApi, attacker: UnitData, attackPoint: Point2D) {
        if (attacker.name === "E1") {
            if (attacker.canMove === false) {
                actionsApi.orderUnits([attacker.id], OrderType.DeploySelected);
            }
        }
        actionsApi.orderUnits([attacker.id], OrderType.AttackMove, attackPoint.x, attackPoint.y);
    }

    private manageAttackMicro(actionsApi: ActionsApi, attacker: UnitData, target: UnitData) {
        const distance = getDistanceBetweenUnits(attacker, target);
        if (attacker.name === "E1") {
            // Para (deployed weapon) range is 5.
            const deployedWeaponRange = attacker.secondaryWeapon?.maxRange || 5;
            actionsApi.orderUnits([attacker.id], OrderType.DeploySelected);
            //console.dir({distance, attacker: attacker.name, canMove: attacker.canMove, primaryMaxRange: attacker.primaryWeapon?.maxRange, secondaryMaxRange: attacker.secondaryWeapon?.maxRange})

            if (attacker.canMove && distance <= deployedWeaponRange * 0.8) {
                actionsApi.orderUnits([attacker.id], OrderType.DeploySelected);
                return;
            } else if (!attacker.canMove && distance > deployedWeaponRange) {
                actionsApi.orderUnits([attacker.id], OrderType.DeploySelected);
                return;
            }
        }
        let targetData = target;
        let orderType: OrderType = OrderType.AttackMove;
        const primaryWeaponRange = attacker.primaryWeapon?.maxRange || 5;
        if (targetData?.type == ObjectType.Building && distance < primaryWeaponRange * 0.8) {
            orderType = OrderType.Attack;
        } else if (targetData?.rules.canDisguise) {
            // Special case for mirage tank/spy as otherwise they just sit next to it.
            orderType = OrderType.Attack;
        }
        actionsApi.orderUnits([attacker.id], orderType, target.id);
    }
}
