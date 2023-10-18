// A sector is a uniform-sized segment of the map.

import { MapApi, PlayerData, Point2D, Tile } from "@chronodivide/game-api";
import { calculateAreaVisibility } from "./map.js";

export const SECTOR_SIZE = 8;

export class Sector {
    // How many times we've attempted to enter the sector.
    private sectorExploreAttempts: number;
    private sectorLastExploredAt: number | undefined;

    constructor(
        public sectorStartPoint: Point2D,
        public sectorStartTile: Tile | undefined,
        public sectorVisibilityPct: number | undefined,
        public sectorVisibilityLastCheckTick: number | undefined,
    ) {
        this.sectorExploreAttempts = 0;
    }

    public onExploreAttempted(currentTick: number) {
        this.sectorExploreAttempts++;
        this.sectorLastExploredAt = currentTick;
    }

    // Whether we should attempt to explore this sector, given the cooldown and limit of attempts.
    public shouldAttemptExploration(currentTick: number, cooldown: number, limit: number) {
        if (limit >= this.sectorExploreAttempts) {
            return false;
        }

        if (this.sectorLastExploredAt && currentTick < this.sectorLastExploredAt + cooldown) {
            return false;
        }

        return true;
    }
}

export class SectorCache {
    private sectors: Sector[][] = [];
    private mapBounds: Point2D;
    private sectorsX: number;
    private sectorsY: number;
    private lastUpdatedSectorX: number | undefined;
    private lastUpdatedSectorY: number | undefined;

    constructor(mapApi: MapApi, mapBounds: Point2D) {
        this.mapBounds = mapBounds;
        this.sectorsX = Math.ceil(mapBounds.x / SECTOR_SIZE);
        this.sectorsY = Math.ceil(mapBounds.y / SECTOR_SIZE);
        this.sectors = new Array(this.sectorsX);
        for (let xx = 0; xx < this.sectorsX; ++xx) {
            this.sectors[xx] = new Array(this.sectorsY);
            for (let yy = 0; yy < this.sectorsY; ++yy) {
                this.sectors[xx][yy] = new Sector(
                    { x: xx * SECTOR_SIZE, y: yy * SECTOR_SIZE },
                    mapApi.getTile(xx * SECTOR_SIZE, yy * SECTOR_SIZE),
                    undefined,
                    undefined,
                );
            }
        }
    }

    public getMapBounds(): Point2D {
        return this.mapBounds;
    }

    public updateSectors(currentGameTick: number, maxSectorsToUpdate: number, mapApi: MapApi, playerData: PlayerData) {
        let nextSectorX = this.lastUpdatedSectorX ? this.lastUpdatedSectorX + 1 : 0;
        let nextSectorY = this.lastUpdatedSectorY ? this.lastUpdatedSectorY : 0;
        let updatedThisCycle = 0;

        while (updatedThisCycle < maxSectorsToUpdate) {
            if (nextSectorX >= this.sectorsX) {
                nextSectorX = 0;
                ++nextSectorY;
            }
            if (nextSectorY >= this.sectorsY) {
                nextSectorY = 0;
                nextSectorX = 0;
            }
            let sector: Sector | undefined = this.getSector(nextSectorX, nextSectorY);
            if (sector) {
                sector.sectorVisibilityLastCheckTick = currentGameTick;
                let sp = sector.sectorStartPoint;
                let ep = {
                    x: sector.sectorStartPoint.x + SECTOR_SIZE,
                    y: sector.sectorStartPoint.y + SECTOR_SIZE,
                };
                let visibility = calculateAreaVisibility(mapApi, playerData, sp, ep);
                if (visibility.validTiles > 0) {
                    sector.sectorVisibilityPct = visibility.visibleTiles / visibility.validTiles;
                } else {
                    sector.sectorVisibilityPct = undefined;
                }
            }
            this.lastUpdatedSectorX = nextSectorX;
            this.lastUpdatedSectorY = nextSectorY;
            ++nextSectorX;
            ++updatedThisCycle;
        }
    }

    // Return % of sectors that are updated.
    public getSectorUpdateRatio(sectorsUpdatedSinceGameTick: number): number {
        let updated = 0,
            total = 0;
        for (let xx = 0; xx < this.sectorsX; ++xx) {
            for (let yy = 0; yy < this.sectorsY; ++yy) {
                let sector: Sector = this.sectors[xx][yy];
                if (
                    sector &&
                    sector.sectorVisibilityLastCheckTick &&
                    sector.sectorVisibilityLastCheckTick >= sectorsUpdatedSinceGameTick
                ) {
                    ++updated;
                }
                ++total;
            }
        }
        return updated / total;
    }

    /**
     * Return the ratio (0-1) of tiles that are visible. Returns undefined if we haven't scanned the whole map yet.
     */
    public getOverallVisibility(): number | undefined {
        let visible = 0,
            total = 0;
        for (let xx = 0; xx < this.sectorsX; ++xx) {
            for (let yy = 0; yy < this.sectorsY; ++yy) {
                let sector: Sector = this.sectors[xx][yy];

                // Undefined visibility.
                if (sector.sectorVisibilityPct != undefined) {
                    visible += sector.sectorVisibilityPct;
                    total += 1.0;
                }
            }
        }
        return visible / total;
    }

    public getSector(sectorX: number, sectorY: number): Sector | undefined {
        if (sectorX < 0 || sectorX >= this.sectorsX || sectorY < 0 || sectorY >= this.sectorsY) {
            return undefined;
        }
        return this.sectors[sectorX][sectorY];
    }

    public getSectorBounds(): Point2D {
        return {
            x: this.sectorsX,
            y: this.sectorsY,
        }
    }

    public getSectorCoordinatesForWorldPosition(x: number, y: number) {
        if (x < 0 || x >= this.mapBounds.x || y < 0 || y >= this.mapBounds.y) {
            return undefined;
        }
        return {
            sectorX: Math.floor(x / SECTOR_SIZE),
            sectorY: Math.floor(y / SECTOR_SIZE)
        }
    }

    public getSectorForWorldPosition(x: number, y: number): Sector | undefined {
        const sectorCoordinates = this.getSectorCoordinatesForWorldPosition(x, y);
        if (!sectorCoordinates) {
            return undefined;
        }
        return this.sectors[Math.floor(x / SECTOR_SIZE)][Math.floor(y / SECTOR_SIZE)];
    }
}
