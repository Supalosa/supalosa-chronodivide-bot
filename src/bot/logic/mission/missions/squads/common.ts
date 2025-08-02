import { AttackState, ObjectType, OrderType, StanceType, UnitData, Vector2, ZoneType } from "@chronodivide/game-api";
import { getDistanceBetweenPoints, getDistanceBetweenUnits } from "../../../map/map.js";
import { BatchableAction } from "../../actionBatcher.js";

const NONCE_GI_DEPLOY = 0;
const NONCE_GI_UNDEPLOY = 1;

// Micro methods
export function manageMoveMicro(attacker: UnitData, attackPoint: Vector2): BatchableAction {
    if (attacker.name === "E1") {
        const isDeployed = attacker.stance === StanceType.Deployed;
        if (isDeployed) {
            return BatchableAction.noTarget(attacker.id, OrderType.DeploySelected, NONCE_GI_UNDEPLOY);
        }
    }

    return BatchableAction.toPoint(attacker.id, OrderType.AttackMove, attackPoint);
}

export function manageAttackMicro(attacker: UnitData, target: UnitData): BatchableAction {
    const distance = getDistanceBetweenUnits(attacker, target);
    if (attacker.name === "E1") {
        // Para (deployed weapon) range is 5.
        const deployedWeaponRange = attacker.secondaryWeapon?.maxRange || 5;
        const isDeployed = attacker.stance === StanceType.Deployed;
        if (!isDeployed && (distance <= deployedWeaponRange || attacker.attackState === AttackState.JustFired)) {
            return BatchableAction.noTarget(attacker.id, OrderType.DeploySelected, NONCE_GI_DEPLOY);
        } else if (isDeployed && distance > deployedWeaponRange) {
            return BatchableAction.noTarget(attacker.id, OrderType.DeploySelected, NONCE_GI_UNDEPLOY);
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
    return BatchableAction.toTargetId(attacker.id, orderType, target.id);
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

    // DEBUG: Underwater unit attack weight debug info
    const isUnderWaterUnit = ["SUB", "DLPH", "SQD"].includes(attacker.name);
    const isNavalTarget = ["DEST", "AEGIS", "CARRIER", "SUB", "HYD", "DRED", "DLPH", "SQD"].includes(target.name);

    // Check anti-air capability
    if (!attacker.primaryWeapon?.projectileRules.isAntiAir && target.zone === ZoneType.Air) {
        return null;
    }

    // Check anti-ground capability (carriers/dreadnoughts and other special ships can be ignored)
    const groundAttackWhitelist = ["CARRIER", "DRED"];
    const ignoreAntiGroundCheck = groundAttackWhitelist.includes(attacker.name);

    if (
        !ignoreAntiGroundCheck &&
        !attacker.primaryWeapon?.projectileRules.isAntiGround &&
        target.zone === ZoneType.Ground
    ) {
        return null;
    }

    // TODO: Add check for naval targets
    // May need to check target.zone === ZoneType.Water or similar naval zones here
    // and whether the attacker has anti-ship capability
    
    const distance = getDistanceBetweenPoints(new Vector2(x, y), new Vector2(hX, hY));
    const weight = 1000000 - distance;
    
    return weight;
}
