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

type PrioritisedScoutTarget = {
    targetPoint2D?: Point2D;
    targetSector?: Sector;
    priority: number;
}

// If we see this percent (0-1.0) of tiles in a sector, we consider it scouted.
const SECTOR_MINIMUM_VISIBILITY = 0.5;

const ENEMY_SPAWN_POINT_PRIORITY = 100;

// Amount of sectors around the starting sector to try to scout.
const NEARBY_SECTOR_RADIUS = 2;
const NEARBY_SECTOR_PRIORITY = 1000;

export class ScoutingManager {
    private scoutingQueue: PriorityQueue<PrioritisedScoutTarget>;

    constructor(private logger: DebugLogger) {
        this.scoutingQueue = new PriorityQueue((p: PrioritisedScoutTarget) => p.priority);
    }

    onGameStart(gameApi: GameApi, playerData: PlayerData, sectorCache: SectorCache) {
        // Queue hostile starting locations with high priority.
        gameApi.mapApi.getStartingLocations().filter((startingLocation) => {
            if (startingLocation == playerData.startLocation) {
                return false;
            }
            let tile = gameApi.mapApi.getTile(startingLocation.x, startingLocation.y);
            return tile ? !gameApi.mapApi.isVisibleTile(tile, playerData.name) : false;
        }).map((tile) => ({
            targetPoint2D: tile,
            priority: ENEMY_SPAWN_POINT_PRIORITY
        })).forEach((target) => {
            this.logger(`Adding ${target.targetPoint2D.x},${target.targetPoint2D.y} to initial scouting queue`);
            this.scoutingQueue.enqueue(target);
        })

        // Queue nearby sectors.
        const { x: startX, y: startY } = playerData.startLocation;
        const { x: sectorsX, y: sectorsY } = sectorCache.getSectorBounds();
        const startingSector = sectorCache.getSectorCoordinatesForWorldPosition(startX, startY);

        if (!startingSector) {
            return;
        }

        for (let x: number = Math.max(0, startingSector.sectorX - NEARBY_SECTOR_RADIUS); x <= Math.min(sectorsX, startingSector.sectorX + NEARBY_SECTOR_PRIORITY); ++x) {
            for (let y: number = Math.max(0, startingSector.sectorY - NEARBY_SECTOR_RADIUS); y <= Math.min(sectorsY, startingSector.sectorY + NEARBY_SECTOR_PRIORITY); ++y) {
                if (x === startingSector?.sectorX && y === startingSector?.sectorY) {
                    continue;
                }
                const sector = sectorCache.getSector(x, y);
                if (sector) {
                    this.scoutingQueue.enqueue({
                        targetSector: sector,
                        priority: NEARBY_SECTOR_PRIORITY
                    });
                }
            }
        }
    }

    onAiUpdate(gameApi: GameApi, playerData: PlayerData) {
        const currentHead = this.scoutingQueue.front();
        if (!currentHead) {
            return;
        }
        if (currentHead.targetPoint2D) {
            const { x, y } = currentHead.targetPoint2D;
            const tile = gameApi.mapApi.getTile(x, y);
            if (tile && gameApi.mapApi.isVisibleTile(tile, playerData.name)) {
                this.logger(`head point is visible, dequeueing`);
                this.scoutingQueue.dequeue();
            }
        } else if (currentHead.targetSector) {
            if (currentHead.targetSector.sectorVisibilityPct ?? 0 > SECTOR_MINIMUM_VISIBILITY) {
                this.logger(`head sector has visibility ${currentHead.targetSector.sectorVisibilityPct}, dequeueing`);
                this.scoutingQueue.dequeue();
            } 
        } else {
            this.scoutingQueue.dequeue();
            throw new Error('PrioritisedScoutingTarget was added with no target');
        }
    }

    getNewScoutTarget() {
        return this.scoutingQueue.dequeue();
    }

    hasScoutTargets() {
        return !this.scoutingQueue.isEmpty();
    }
}