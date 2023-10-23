import { GameApi, PlayerData, Point2D } from "@chronodivide/game-api";
import { Sector, SectorCache } from "../map/sector";
import { DebugLogger } from "./utils";
import { PriorityQueue } from "@datastructures-js/priority-queue";

export const getUnseenStartingLocations = (gameApi: GameApi, playerData: PlayerData) => {
    const unseenStartingLocations = gameApi.mapApi.getStartingLocations().filter((startingLocation) => {
        if (startingLocation == playerData.startLocation) {
            return false;
        }
        let tile = gameApi.mapApi.getTile(startingLocation.x, startingLocation.y);
        return tile ? !gameApi.mapApi.isVisibleTile(tile, playerData.name) : false;
    });
    return unseenStartingLocations;
};

class PrioritisedScoutTarget {
    private _targetPoint2D?: Point2D;
    private _targetSector?: Sector;
    private _priority: number;

    constructor(priority: number, target: Point2D | Sector) {
        if (target.hasOwnProperty("x") && target.hasOwnProperty("y")) {
            this._targetPoint2D = target as Point2D;
        } else if (target.hasOwnProperty("sectorStartPoint")) {
            this._targetSector = target as Sector;
        } else {
            throw new TypeError(`invalid object passed as target: ${target}`);
        }
        this._priority = priority;
    }

    get priority() {
        return this._priority;
    }

    asPoint2D() {
        return this._targetPoint2D ?? this._targetSector?.sectorStartPoint ?? null;
    }

    get targetSector() {
        return this._targetSector;
    }
}

const ENEMY_SPAWN_POINT_PRIORITY = 100;

// Amount of sectors around the starting sector to try to scout.
const NEARBY_SECTOR_RADIUS = 2;
const NEARBY_SECTOR_BASE_PRIORITY = 1000;

export class ScoutingManager {
    private scoutingQueue: PriorityQueue<PrioritisedScoutTarget>;

    constructor(private logger: DebugLogger) {
        // Order by descending priority.
        this.scoutingQueue = new PriorityQueue((a: PrioritisedScoutTarget, b: PrioritisedScoutTarget) => b.priority - a.priority);
    }

    onGameStart(gameApi: GameApi, playerData: PlayerData, sectorCache: SectorCache) {
        // Queue hostile starting locations with high priority.
        gameApi.mapApi
            .getStartingLocations()
            .filter((startingLocation) => {
                if (startingLocation == playerData.startLocation) {
                    return false;
                }
                let tile = gameApi.mapApi.getTile(startingLocation.x, startingLocation.y);
                return tile ? !gameApi.mapApi.isVisibleTile(tile, playerData.name) : false;
            })
            .map((tile) => new PrioritisedScoutTarget(ENEMY_SPAWN_POINT_PRIORITY, tile))
            .forEach((target) => {
                this.logger(`Adding ${target.asPoint2D()?.x},${target.asPoint2D()?.y} to initial scouting queue`);
                this.scoutingQueue.enqueue(target);
            });

        // Queue nearby sectors.
        const { x: startX, y: startY } = playerData.startLocation;
        const { x: sectorsX, y: sectorsY } = sectorCache.getSectorBounds();
        const startingSector = sectorCache.getSectorCoordinatesForWorldPosition(startX, startY);

        if (!startingSector) {
            return;
        }

        for (
            let x: number = Math.max(0, startingSector.sectorX - NEARBY_SECTOR_RADIUS);
            x <= Math.min(sectorsX, startingSector.sectorX + NEARBY_SECTOR_RADIUS);
            ++x
        ) {
            for (
                let y: number = Math.max(0, startingSector.sectorY - NEARBY_SECTOR_RADIUS);
                y <= Math.min(sectorsY, startingSector.sectorY + NEARBY_SECTOR_RADIUS);
                ++y
            ) {
                if (x === startingSector?.sectorX && y === startingSector?.sectorY) {
                    continue;
                }
                // Make it scout closer sectors first.
                const distanceFactor = Math.pow(x - startingSector.sectorX, 2) + Math.pow(y - startingSector.sectorY, 2);
                const sector = sectorCache.getSector(x, y);
                if (sector) {
                    const maybeTarget = new PrioritisedScoutTarget(NEARBY_SECTOR_BASE_PRIORITY - distanceFactor, sector);
                    const maybePoint = maybeTarget.asPoint2D();
                    if (maybePoint && gameApi.mapApi.getTile(maybePoint.x, maybePoint.y)) {
                        this.scoutingQueue.enqueue(maybeTarget);
                    }
                }
            }
        }
    }

    onAiUpdate(gameApi: GameApi, playerData: PlayerData) {
        const currentHead = this.scoutingQueue.front();
        if (!currentHead) {
            return;
        }
        const head = currentHead.asPoint2D();
        if (!head) {
            this.scoutingQueue.dequeue();
            return;
        }
        const { x, y } = head;
        const tile = gameApi.mapApi.getTile(x, y);
        if (tile && gameApi.mapApi.isVisibleTile(tile, playerData.name)) {
            this.logger(`head point is visible, dequeueing`);
            this.scoutingQueue.dequeue();
        }
    }

    getNewScoutTarget() {
        return this.scoutingQueue.dequeue();
    }

    hasScoutTargets() {
        return !this.scoutingQueue.isEmpty();
    }
}
