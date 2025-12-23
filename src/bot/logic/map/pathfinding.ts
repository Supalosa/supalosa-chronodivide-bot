import { GameApi, Vector2, SpeedType } from "@chronodivide/game-api";

/**
 * Check if target point is reachable
 * @param gameApi GameApi instance
 * @param startPoint start point
 * @param targetPoint target point
 * @param speedType movement type
 * @param maxAllowedError maximum allowed error (in tiles), default is 1
 * @returns returns true if target point is reachable, false otherwise
 */
export function isPointReachable(
    gameApi: GameApi,
    startPoint: Vector2,
    targetPoint: Vector2,
    speedType: SpeedType,
    maxAllowedError: number = 1,
    considerUnitAboveCeiling: boolean = false
): boolean {
    // Get tiles for start and end points
    const startTile = gameApi.mapApi.getTile(startPoint.x, startPoint.y);
    const targetTile = gameApi.mapApi.getTile(targetPoint.x, targetPoint.y);
    
    // If either point is not a valid tile, return false
    if (!startTile || !targetTile) {
        return false;
    }

    // Check if start and end points are on bridges
    const startOnBridge = startTile.onBridgeLandType !== undefined;
    const targetOnBridge = targetTile.onBridgeLandType !== undefined;
    
    // Use findPath to get path, set onBridge parameter based on actual bridge status
    const path = gameApi.mapApi.findPath(
        speedType,
        considerUnitAboveCeiling,
        { tile: startTile, onBridge: startOnBridge },
        { tile: targetTile, onBridge: targetOnBridge }
    );
    
    // If no path found, return false directly
    if (!path || path.length === 0) {
        return false;
    }

    // Get the end point of the path
    const pathEndPoint = path[0].tile;
    
    // Calculate distance between path end point and target point
    const endPointDistance = new Vector2(pathEndPoint.rx, pathEndPoint.ry).distanceTo(targetPoint);
    
    // If distance is less than or equal to maximum allowed error, consider it reachable
    return endPointDistance <= maxAllowedError;
} 