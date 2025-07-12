import { GameApi, Vector2, SpeedType } from "@chronodivide/game-api";

/**
 * 判断目标点是否可达
 * @param gameApi GameApi实例
 * @param startPoint 起始点
 * @param targetPoint 目标点
 * @param speedType 移动类型
 * @param maxAllowedError 允许的最大误差（格子数），默认为1
 * @returns 如果目标点可达返回true，否则返回false
 */
export function isPointReachable(
    gameApi: GameApi,
    startPoint: Vector2,
    targetPoint: Vector2,
    speedType: SpeedType,
    maxAllowedError: number = 1,
    considerUnitAboveCeiling: boolean = false
): boolean {
    // 获取起点和终点的tile
    const startTile = gameApi.mapApi.getTile(startPoint.x, startPoint.y);
    const targetTile = gameApi.mapApi.getTile(targetPoint.x, targetPoint.y);
    
    // 如果任一点不是有效的tile，返回false
    if (!startTile || !targetTile) {
        return false;
    }

    // 使用findPath获取路径
    const path = gameApi.mapApi.findPath(
        speedType,
        considerUnitAboveCeiling,
        { tile: startTile, onBridge: false },
        { tile: targetTile, onBridge: false }
    );
    
    // 如果没有找到路径，直接返回false
    if (!path || path.length === 0) {
        return false;
    }

    // 获取路径的终点
    const pathEndPoint = path[0].tile;
    
    // 计算路径终点和目标点之间的距离
    const endPointDistance = new Vector2(pathEndPoint.rx, pathEndPoint.ry).distanceTo(targetPoint);
    
    // 如果距离小于等于允许的最大误差，则认为可达
    return endPointDistance <= maxAllowedError;
} 