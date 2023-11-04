import {
    ActionsApi,
    AttackState,
    ObjectType,
    OrderType,
    Point2D,
    StanceType,
    UnitData,
    Vector2,
    ZoneType,
} from "@chronodivide/game-api";
import { getDistanceBetweenPoints, getDistanceBetweenUnits } from "../../map/map.js";

// Micro methods
export function manageMoveMicro(actionsApi: ActionsApi, attacker: UnitData, attackPoint: Point2D) {
    if (attacker.name === "E1") {
        const isDeployed = attacker.stance === StanceType.Deployed;
        if (isDeployed) {
            actionsApi.orderUnits([attacker.id], OrderType.DeploySelected);
        }
    }
    actionsApi.orderUnits([attacker.id], OrderType.Move, attackPoint.x, attackPoint.y);
}

export function manageAttackMicro(actionsApi: ActionsApi, attacker: UnitData, target: UnitData) {
    const distance = getDistanceBetweenUnits(attacker, target);
    if (attacker.name === "E1") {
        // Para (deployed weapon) range is 5.
        const deployedWeaponRange = attacker.secondaryWeapon?.maxRange || 5;
        const isDeployed = attacker.stance === StanceType.Deployed;
        if (!isDeployed && (distance <= deployedWeaponRange || attacker.attackState === AttackState.JustFired)) {
            actionsApi.orderUnits([attacker.id], OrderType.DeploySelected);
            return;
        } else if (isDeployed && distance > deployedWeaponRange) {
            actionsApi.orderUnits([attacker.id], OrderType.DeploySelected);
            return;
        }
    }
    let targetData = target;
    let orderType: OrderType = OrderType.Attack;
    const primaryWeaponRange = attacker.primaryWeapon?.maxRange || 5;
    if (targetData?.type == ObjectType.Building && distance < primaryWeaponRange * 0.8) {
        orderType = OrderType.Attack;
    } else if (targetData?.rules.canDisguise) {
        // Special case for mirage tank/spy as otherwise they just sit next to it.
        orderType = OrderType.Attack;
    }
    actionsApi.orderUnits([attacker.id], orderType, target.id);
}

/**
 *
 * @param attacker
 * @param target
 * @returns A number describing the weight of the given target for the attacker, or null if it should not attack it.
 */
export function getAttackWeight(attacker: UnitData, target: UnitData): number | null {
    const { rx: x, ry: y } = attacker.tile;
    const { rx: hX, ry: hY } = target.tile;

    if (!attacker.primaryWeapon?.projectileRules.isAntiAir && target.zone === ZoneType.Air) {
        return null;
    }

    if (!attacker.primaryWeapon?.projectileRules.isAntiGround && target.zone === ZoneType.Ground) {
        return null;
    }

    return 1000000 - getDistanceBetweenPoints(new Vector2(x, y), new Vector2(hX, hY));
}
