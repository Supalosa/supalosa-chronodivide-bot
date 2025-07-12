import { GameApi, LandType, OrderType, Vector2 } from "@chronodivide/game-api";
import { ActionBatcher, BatchableAction } from "../mission/actionBatcher.js";

/**
 * Check if there is a clear 2-cell-wide water corridor between two points.
 */
export function hasClearWaterLoS(
    gameApi: GameApi,
    from: Vector2,
    to: Vector2,
    corridorHalfWidth: number = 1,
): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) return true;

    for (let i = 0; i <= steps; i++) {
        const cx = Math.round(from.x + (dx * i) / steps);
        const cy = Math.round(from.y + (dy * i) / steps);

        for (let ox = -corridorHalfWidth; ox <= corridorHalfWidth; ox++) {
            for (let oy = -corridorHalfWidth; oy <= corridorHalfWidth; oy++) {
                const tx = cx + ox;
                const ty = cy + oy;
                const tile = gameApi.mapApi.getTile(tx, ty);
                if (!tile) return false;
                if ((tile.landType !== LandType.Clear && tile.landType !== LandType.Water) || tile.onBridgeLandType !== undefined) {
                    return false;
                }
            }
        }
    }
    return true;
}

/**
 * Randomly search around a target position for a water tile with clear LoS to that target.
 */
export function findWaterFiringPoint(
    gameApi: GameApi,
    targetPos: Vector2,
    radiusMin: number,
    radiusMax: number,
    attempts: number = 10,
): Vector2 | null {
    for (let attempt = 0; attempt < attempts; attempt++) {
        const ang = gameApi.generateRandom() * Math.PI * 2;
        const radius = radiusMin + gameApi.generateRandom() * (radiusMax - radiusMin);
        const dest = targetPos.add(
            new Vector2(Math.round(Math.cos(ang) * radius), Math.round(Math.sin(ang) * radius)),
        );
        const tile = gameApi.mapApi.getTile(dest.x, dest.y);
        if (!tile) continue;
        if (tile.landType !== LandType.Water || tile.onBridgeLandType !== undefined) continue;
        if (!hasClearWaterLoS(gameApi, dest, targetPos)) continue;
        return dest;
    }
    return null;
}

/**
 * Safe wrapper to push toPoint actions only if destination tile is valid.
 */
export function pushToPointSafe(
    gameApi: GameApi,
    actionBatcher: ActionBatcher,
    unitId: number,
    orderType: OrderType,
    point: Vector2,
) {
    if (gameApi.mapApi.getTile(point.x, point.y)) {
        actionBatcher.push(BatchableAction.toPoint(unitId, orderType, point));
    }
} 