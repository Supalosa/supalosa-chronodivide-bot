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

    // DEBUG: 水下单位攻击权重调试信息
    const isUnderWaterUnit = ["SUB", "DLPH", "SQD"].includes(attacker.name);
    const isNavalTarget = ["DEST", "AEGIS", "CARRIER", "SUB", "HYD", "DRED", "DLPH", "SQD"].includes(target.name);
    
    if (isUnderWaterUnit || isNavalTarget) {
        console.log(`[NAVAL_DEBUG] 攻击权重检查: ${attacker.name}(id:${attacker.id}) -> ${target.name}(id:${target.id})`);
        console.log(`[NAVAL_DEBUG]   攻击者位置: (${x}, ${y}), 目标位置: (${hX}, ${hY})`);
        console.log(`[NAVAL_DEBUG]   攻击者区域: ${attacker.zone}, 目标区域: ${target.zone}`);
        console.log(`[NAVAL_DEBUG]   是否水下单位: ${isUnderWaterUnit}, 是否海军目标: ${isNavalTarget}`);
        
        if (attacker.primaryWeapon) {
            console.log(`[NAVAL_DEBUG]   主武器信息: maxRange=${attacker.primaryWeapon.maxRange}`);
            console.log(`[NAVAL_DEBUG]   主武器弹道: isAntiAir=${attacker.primaryWeapon.projectileRules.isAntiAir}, isAntiGround=${attacker.primaryWeapon.projectileRules.isAntiGround}`);
        } else {
            console.log(`[NAVAL_DEBUG]   没有主武器!`);
        }
        
        if (attacker.secondaryWeapon) {
            console.log(`[NAVAL_DEBUG]   副武器信息: maxRange=${attacker.secondaryWeapon.maxRange}`);
            console.log(`[NAVAL_DEBUG]   副武器弹道: isAntiAir=${attacker.secondaryWeapon.projectileRules.isAntiAir}, isAntiGround=${attacker.secondaryWeapon.projectileRules.isAntiGround}`);
        }
    }

    // 检查防空能力
    if (!attacker.primaryWeapon?.projectileRules.isAntiAir && target.zone === ZoneType.Air) {
        if (isUnderWaterUnit) {
            console.log(`[NAVAL_DEBUG]   -> 拒绝攻击: 没有防空能力但目标在空中`);
        }
        return null;
    }

    // 检查对地能力（航母/无畏等特殊舰船可忽略）
    const groundAttackWhitelist = ["CARRIER", "DRED"];
    const ignoreAntiGroundCheck = groundAttackWhitelist.includes(attacker.name);

    if (
        !ignoreAntiGroundCheck &&
        !attacker.primaryWeapon?.projectileRules.isAntiGround &&
        target.zone === ZoneType.Ground
    ) {
        if (isUnderWaterUnit) {
            console.log(`[NAVAL_DEBUG]   -> 拒绝攻击: 没有对地能力但目标在地面`);
        }
        return null;
    }

    // TODO: 添加对海军目标的检查
    // 这里可能需要检查 target.zone === ZoneType.Water 或类似的海军区域
    // 以及攻击者是否具有反舰能力
    
    const distance = getDistanceBetweenPoints(new Vector2(x, y), new Vector2(hX, hY));
    const weight = 1000000 - distance;
    
    if (isUnderWaterUnit || isNavalTarget) {
        console.log(`[NAVAL_DEBUG]   -> 攻击权重: ${weight} (距离: ${distance})`);
    }
    
    return weight;
}
