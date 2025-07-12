import { GameApi, GameMath, PlayerData, Vector2 } from "@chronodivide/game-api";
import { Sector, SectorCache, SECTOR_SIZE } from "../map/sector.js";
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

export class PrioritisedScoutTarget {
    private _targetPoint?: Vector2;
    private _targetSector?: Sector;
    private _priority: number;

    constructor(
        priority: number,
        target: Vector2 | Sector,
        private permanent: boolean = false,
    ) {
        if (target.hasOwnProperty("x") && target.hasOwnProperty("y")) {
            this._targetPoint = target as Vector2;
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

    asVector2() {
        return this._targetPoint ?? this._targetSector?.sectorStartPoint ?? null;
    }

    get targetSector() {
        return this._targetSector;
    }

    get isPermanent() {
        return this.permanent;
    }
}

const ENEMY_SPAWN_POINT_PRIORITY = 100;

// Amount of sectors around the starting sector to try to scout.
const NEARBY_SECTOR_STARTING_RADIUS = 2;
const NEARBY_SECTOR_BASE_PRIORITY = 1000;

// Amount of ticks per 'radius' to expand for scouting.
const SCOUTING_RADIUS_EXPANSION_TICKS = 9000; // 10 minutes

export class ScoutingManager {
    private scoutingQueue: PriorityQueue<PrioritisedScoutTarget>;

    private queuedRadius = NEARBY_SECTOR_STARTING_RADIUS;

    constructor(private logger: DebugLogger) {
        // Order by descending priority.
        this.scoutingQueue = new PriorityQueue(
            (a: PrioritisedScoutTarget, b: PrioritisedScoutTarget) => b.priority - a.priority,
        );
    }

    /**
     * Enqueue multiple scout targets within each sector inside the given radius.
     * For better coverage we push 3 points per sector: top-left (existing), centre, and bottom-right.
     */
    addRadiusToScout(
        gameApi: GameApi,
        centerPoint: Vector2,
        sectorCache: SectorCache,
        radius: number,
        startingPriority: number,
    ) {
        const { x: startX, y: startY } = centerPoint;
        const { width: sectorsX, height: sectorsY } = sectorCache.getSectorBounds();
        const startingSector = sectorCache.getSectorCoordinatesForWorldPosition(startX, startY);

        if (!startingSector) {
            return;
        }

        for (
            let x: number = Math.max(0, startingSector.sectorX - radius);
            x < Math.min(sectorsX, startingSector.sectorX + radius);
            ++x
        ) {
            for (
                let y: number = Math.max(0, startingSector.sectorY - radius);
                y < Math.min(sectorsY, startingSector.sectorY + radius);
                ++y
            ) {
                if (x === startingSector?.sectorX && y === startingSector?.sectorY) {
                    continue;
                }
                // Make it scout closer sectors first.
                const distanceFactor =
                    GameMath.pow(x - startingSector.sectorX, 2) + GameMath.pow(y - startingSector.sectorY, 2);
                const sector = sectorCache.getSector(x, y);
                if (sector) {
                    // Prepare multiple sampling points inside this sector
                    const points: Vector2[] = [];
                    // Top-left (sector start)
                    points.push(sector.sectorStartPoint);
                    // Centre point
                    points.push(
                        new Vector2(
                            sector.sectorStartPoint.x + Math.floor(SECTOR_SIZE / 2),
                            sector.sectorStartPoint.y + Math.floor(SECTOR_SIZE / 2),
                        ),
                    );
                    // Bottom-right corner (ensure within bounds)
                    points.push(
                        new Vector2(
                            Math.min(sector.sectorStartPoint.x + SECTOR_SIZE - 1, sectorCache.getMapBounds().width - 1),
                            Math.min(sector.sectorStartPoint.y + SECTOR_SIZE - 1, sectorCache.getMapBounds().height - 1),
                        ),
                    );

                    points.forEach((pt) => {
                        if (!gameApi.mapApi.getTile(pt.x, pt.y)) return;
                        const tgt = new PrioritisedScoutTarget(startingPriority - distanceFactor, pt);
                        this.scoutingQueue.enqueue(tgt);
                    });
                }
            }
        }
    }

    /**
     * Ensure every enemy starting location remains queued until actually explored.
     */
    private ensureEnemyStartLocations(
        gameApi: GameApi,
        playerData: PlayerData,
    ) {
        gameApi.mapApi
            .getStartingLocations()
            .filter((loc) => loc !== playerData.startLocation)
            .forEach((loc) => {
                const tile = gameApi.mapApi.getTile(loc.x, loc.y);
                if (!tile) return;
                if (gameApi.mapApi.isVisibleTile(tile, playerData.name)) {
                    return; // already visible
                }
                // Re-enqueue if not already in queue.
                const key = `${loc.x},${loc.y}`;
                const existsInQueue = this.scoutingQueue
                    .toArray()
                    .some((t) => {
                        const v = t.asVector2();
                        return v && v.x === loc.x && v.y === loc.y;
                    });
                if (!existsInQueue) {
                    this.logger(`Re-queue unseen enemy spawn at ${loc.x},${loc.y}`);
                    this.scoutingQueue.enqueue(new PrioritisedScoutTarget(ENEMY_SPAWN_POINT_PRIORITY, loc, true));
                }
            });
    }

    onGameStart(gameApi: GameApi, playerData: PlayerData, sectorCache: SectorCache) {
        // Queue hostile starting locations with high priority and as permanent scouting candidates.
        gameApi.mapApi
            .getStartingLocations()
            .filter((startingLocation) => {
                if (startingLocation == playerData.startLocation) {
                    return false;
                }
                let tile = gameApi.mapApi.getTile(startingLocation.x, startingLocation.y);
                return tile ? !gameApi.mapApi.isVisibleTile(tile, playerData.name) : false;
            })
            .map((tile) => new PrioritisedScoutTarget(ENEMY_SPAWN_POINT_PRIORITY, tile, true))
            .forEach((target) => {
                this.logger(`Adding ${target.asVector2()?.x},${target.asVector2()?.y} to initial scouting queue`);
                this.scoutingQueue.enqueue(target);
            });

        // Queue sectors near the spawn point.
        this.addRadiusToScout(
            gameApi,
            playerData.startLocation,
            sectorCache,
            NEARBY_SECTOR_STARTING_RADIUS,
            NEARBY_SECTOR_BASE_PRIORITY,
        );
    }

    onAiUpdate(gameApi: GameApi, playerData: PlayerData, sectorCache: SectorCache) {
        // Ensure unseen enemy spawn points are always considered.
        this.ensureEnemyStartLocations(gameApi, playerData);
        const currentHead = this.scoutingQueue.front();
        if (!currentHead) {
            return;
        }
        const head = currentHead.asVector2();
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

        const requiredRadius = Math.floor(gameApi.getCurrentTick() / SCOUTING_RADIUS_EXPANSION_TICKS);
        if (requiredRadius > this.queuedRadius) {
            this.logger(`expanding scouting radius from ${this.queuedRadius} to ${requiredRadius}`);
            this.addRadiusToScout(
                gameApi,
                playerData.startLocation,
                sectorCache,
                requiredRadius,
                NEARBY_SECTOR_BASE_PRIORITY,
            );
            this.queuedRadius = requiredRadius;
        }
    }

    getNewScoutTarget() {
        return this.scoutingQueue.dequeue();
    }

    hasScoutTargets() {
        return !this.scoutingQueue.isEmpty();
    }
}
