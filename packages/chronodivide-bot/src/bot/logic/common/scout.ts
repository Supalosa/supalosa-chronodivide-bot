import { GameApi, GameMath, PlayerData, Vector2 } from "@chronodivide/game-api";
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
                    const maybeTarget = new PrioritisedScoutTarget(startingPriority - distanceFactor, sector);
                    const maybePoint = maybeTarget.asVector2();
                    if (maybePoint && gameApi.mapApi.getTile(maybePoint.x, maybePoint.y)) {
                        this.scoutingQueue.enqueue(maybeTarget);
                    }
                }
            }
        }
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
