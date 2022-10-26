import { GameApi, MapApi, PlayerData, Point2D } from "@chronodivide/game-api";

// Expensive one-time call to determine the size of the map.
// The result is a point just outside the bounds of the map.
export function determineMapBounds(mapApi: MapApi): Point2D {
    // TODO Binary Search this.
    // Start from the last spawn positions to save time.
    let maxX: number = 0;
    let maxY: number = 0;
    mapApi.getStartingLocations().forEach((point) => {
        if (point.x > maxX) {
            maxX = point.x;
        }
        if (point.y > maxY) {
            maxY = point.y;
        }
    });
    // Expand outwards until we find the bounds.
    for (let testX = maxX; testX < 10000; ++testX) {
        if (mapApi.getTile(testX, 0) == undefined) {
            maxX = testX;
            break;
        }
    }
    for (let testY = maxY; testY < 10000; ++testY) {
        if (mapApi.getTile(testY, 0) == undefined) {
            maxY = testY;
            break;
        }
    }
    return {x: maxX, y: maxY};
}


export function calculateAreaVisibility(mapApi: MapApi, playerData: PlayerData, startPoint: Point2D, endPoint: Point2D): {visibleTiles: number, validTiles: number} {
    let validTiles: number = 0, visibleTiles: number = 0;
    for (let xx = startPoint.x; xx < endPoint.x; ++xx) {
        for (let yy = startPoint.y; yy < endPoint.y; ++yy) {
            let tile = mapApi.getTile(xx, yy)
            if (tile) {
                ++validTiles;
                if (mapApi.isVisibleTile(tile, playerData.name)) {
                    ++visibleTiles;
                }
            }
        }
    }
    let result = {visibleTiles, validTiles};
    return result;
}

export function getPointTowardsOtherPoint(gameApi: GameApi, startLocation: Point2D, endLocation: Point2D, minRadius: number, maxRadius: number, randomAngle: number): Point2D {
    let radius = minRadius + Math.round(gameApi.generateRandom() * (maxRadius - minRadius));
    let directionToSpawn = Math.atan2(endLocation.y - startLocation.y, endLocation.x - startLocation.x);
    let randomisedDirection = directionToSpawn - ((randomAngle * (Math.PI / 12)) + (2 * randomAngle * gameApi.generateRandom() * (Math.PI / 12)));
    let candidatePointX = Math.round(startLocation.x + Math.cos(randomisedDirection) * radius);
    let candidatePointY = Math.round(startLocation.y + Math.sin(randomisedDirection) * radius);
    return {x: candidatePointX, y: candidatePointY};
}

export function getDistanceBetweenPoints(startLocation: Point2D, endLocation: Point2D): number {
    return Math.sqrt((startLocation.x - endLocation.x)**2 + (startLocation.y - endLocation.y)**2);
}