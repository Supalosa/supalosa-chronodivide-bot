// A sector is a uniform-sized segment of the map.

import { Size } from "@chronodivide/game-api";
import { BasicIncrementalGridCache, IncrementalGridCache, IncrementalGridCell, SequentialScanStrategy, toHeatmapColor, toRGBNum } from "./incrementalGridCache.js";

export const SECTOR_SIZE = 8;

/**
 * A Sector is an 8x8 area of the map, grouped together for scouting purposes.
 */
export type Sector = {
    /**
     * Null means there are no valid tiles in the sector.
     */
    sectorVisibilityRatio: number | null;
    /**
     * Raw threat level in the sector (based on actual observation)
     */
    threatLevel: number | null;
    /**
     * Derived threat level in the sector (based on diffusing the threat to neighbouring sectors)
     */
    diffuseThreatLevel: number | null;
};

/**
 * Wrapper around IncrementalGridCache that handles scaling from tile coordinates to sectors (could probably also be refactored out)
 */
export class SectorCache implements IncrementalGridCache<Sector> {
    private gridCache: BasicIncrementalGridCache<Sector>;

    constructor(private mapBounds: Size,
        initFn: (startX: number, startY: number) => Sector,
        updateFn: (startX: number, startY: number, size: number, currentValue: Sector, neighbors: Sector[]) => Sector) {
        const sectorsX = Math.ceil(mapBounds.width / SECTOR_SIZE);
        const sectorsY = Math.ceil(mapBounds.height / SECTOR_SIZE);

        let maxThreatColored = 1;
        this.gridCache = new BasicIncrementalGridCache<Sector>(
            sectorsX,
            sectorsY,
            initFn,
            (sectorX, sectorY) => {
                const neighbours: Sector[] = [];
                // send the neighbours as well, to allow for diffuse sector threat
                this.gridCache.forEachInRadius(sectorX, sectorY, 1, (nX, nY, s) => {
                    if (nX !== sectorX || nY !== sectorY) {
                        neighbours.push(s.value);
                    }
                });
                return updateFn(sectorX * SECTOR_SIZE, sectorY * SECTOR_SIZE, SECTOR_SIZE, this.gridCache.getCell(sectorX, sectorY)!.value, neighbours)
            },
            new SequentialScanStrategy(),
            (sector) => {
                maxThreatColored = Math.max(sector.diffuseThreatLevel ?? 0, maxThreatColored);
                return toHeatmapColor(sector.diffuseThreatLevel, 0, maxThreatColored);
            }
        );
    }

    getSize() {
        return this.gridCache.getSize();
    }
    
    // n.b. this is not passing on the scaling correctly
    getCell(x: number, y: number) {
        return this.gridCache.getCell(x, y);
    }

    forEach(fn: (x: number, y: number, cell: IncrementalGridCell<Sector>) => void): void {
        throw new Error("Method not implemented.");
    }

    public updateSectors(currentGameTick: number, maxSectorsToUpdate: number) {
        this.gridCache.updateCells(maxSectorsToUpdate, currentGameTick);
    }

    
    // Return % of sectors that are updated since a certain time
    public getSectorUpdateRatio(sectorsUpdatedSinceGameTick: number): number {
        let updated = 0,
            total = 0;
        this.gridCache.forEach((_x, _y, cell) => {
            if (
                cell.lastUpdatedTick !== null &&
                cell.lastUpdatedTick >= sectorsUpdatedSinceGameTick
            ) {
                ++updated;
            }
            ++total;
        });
        return updated / total;
    }
    
    /**
     * Return the ratio (0-1) of tiles that are visible.
     */
    public getOverallVisibility(): number | undefined {
        let visible = 0,
            total = 0;
        this.gridCache.forEach((_x, _y, cell) => {
            const sector = cell.value;
            // Undefined visibility.
            if (sector.sectorVisibilityRatio != undefined) {
                visible += sector.sectorVisibilityRatio;
                total += 1.0;
            }
        });
        return visible / total;
    }

    public forEachInRadius(
        tileX: number,
        tileY: number,
        radius: number,
        fn: (x: number, y: number, sector: IncrementalGridCell<Sector>, dist: number) => void) {
        const startingSector = this.getSectorCoordinatesForWorldPosition(tileX, tileY);
        if (!startingSector) {
            return;
        }
        this.gridCache.forEachInRadius(startingSector.sectorX,
            startingSector.sectorY, Math.ceil(radius / SECTOR_SIZE), (x, y, cell, distance) => {
                fn(
                    Math.floor(x * SECTOR_SIZE + SECTOR_SIZE / 2),
                    Math.floor(y * SECTOR_SIZE + SECTOR_SIZE / 2),
                    cell,
                    distance);
        });
    }

    private getSectorCoordinatesForWorldPosition(x: number, y: number) {
        if (x < 0 || x >= this.mapBounds.width || y < 0 || y >= this.mapBounds.height) {
            return undefined;
        }
        return {
            sectorX: Math.floor(x / SECTOR_SIZE),
            sectorY: Math.floor(y / SECTOR_SIZE),
        };
    }

    public _renderScale() {
        return SECTOR_SIZE;
    }

    // n.b. this is not passing on the scaling correctly
    public _getCellDebug(x: number, y: number): (IncrementalGridCell<Sector> & { color: number; }) | null {
        return this.gridCache._getCellDebug(x, y);
    }
}
