import { ActionsApi, ObjectType, OrderType, Point2D, UnitData } from "@chronodivide/game-api";
import { getDistanceBetweenUnits } from "../../map/map.js";

// Micro methods
export function manageMoveMicro(actionsApi: ActionsApi, attacker: UnitData, attackPoint: Point2D) {
    if (attacker.name === "E1") {
        if (!attacker.canMove) {
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
