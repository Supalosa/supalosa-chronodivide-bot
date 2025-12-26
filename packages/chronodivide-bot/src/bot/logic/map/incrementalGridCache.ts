import { GameMath, Size } from "@chronodivide/game-api";

export type IncrementalGridCell<T> = {
    lastUpdatedTick: number | null;
    value: T;
}

export function toHeatmapColor(value: number | null | undefined, minScale: number = 0, maxScale: number = 1) {
    if (value === undefined || value === null) {
        return 0;
    }
    const ratio = 2 * (value - minScale) / (maxScale - minScale)
    const b = Math.max(0, 255*(1 - ratio))
    const r = Math.max(0, 255*(ratio - 1))
    const g = 255 - b - r
    return toRGBNum(r, g, b)
}

export function toRGBNum(red: number, green: number, blue: number) {
    return red << 16 | green << 8 | blue;
}

export function fromRGBNum(num: number) {
    return [num >> 16 & 0xFF, num >> 8 & 0xFF, num & 0xFF];
}

export interface IncrementalGridCache<T> {
    getSize(): Size;
    getCell(x: number, y: number): IncrementalGridCell<T> | null;
    forEach(fn: (x: number, y: number, cell: IncrementalGridCell<T>) => void): void;
    forEachInRadius(startX: number, startY: number, radius: number, fn: (x: number, y: number, cell: IncrementalGridCell<T>, dist: number) => void): void;

    // For debug purposes, how large each cell is in game tiles.
    _renderScale(): number;
    _getCellDebug(x: number, y: number): IncrementalGridCell<T> & { color: number } | null;
}

/**
 * A class that allows spatial information to be updated lazily as needed, meaning some (or many) grid locations may be stale.
 * 
 * In game terms, a grid may be a cell for high-resolution information, or multiple cells for low resolution information (e.g. scouting sectors).
 */
export class BasicIncrementalGridCache<T> implements IncrementalGridCache<T> {
    private cells: IncrementalGridCell<T>[][] = [];

    constructor(
        private width: number,
        private height: number,
        initCellFn: (x: number, y: number) => T,
        private updateCellFn: (x: number, y: number) => T,
        private scanStrategy: IncrementalGridCacheUpdateStrategy,
        private valueToDebugColor: (value: T) => number) {
        for (let x = 0; x < width; ++x) {
            this.cells[x] = new Array(height);
            for (let y = 0; y < height; ++y) {
                this.cells[x][y] = {
                    lastUpdatedTick: null,
                    value: initCellFn(x, y)
                };
            }
        }
    }

    public getSize(): Size {
        return { width: this.width, height: this.height }
    }

    public getCell(x: number, y: number): IncrementalGridCell<T> | null {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return null;
        }
        return this.cells[x][y];
    }

    public _getCellDebug(x: number, y: number): IncrementalGridCell<T> & { color: number } | null {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return null;
        }
        const cell = this.cells[x][y];
        return {
            ...cell,
            color: this.valueToDebugColor(cell.value)
        };
    }

    /**
     * Using the IncrementalGridCacheUpdateStrategy provided at construction time, update a certain number of cells with new values.
     * 
     * @param numCellsToUpdate Number of cells to update
     */
    public updateCells(numCellsToUpdate: number, gameTick: number) {
        for (let i = 0; i < numCellsToUpdate; ++i) {
            const nextCell = this.scanStrategy.getNextCellToUpdate(this.width, this.height);
            if (!nextCell) {
                break;
            }
            const { x, y } = nextCell;
            const newValue = this.updateCellFn(x, y);
            this.cells[x][y] = {
                lastUpdatedTick: gameTick,
                value: newValue,
            };
        }
    }

    public forEach(fn: (x: number, y: number, cell: IncrementalGridCell<T>) => void) {
        for (let x = 0; x < this.width; ++x) {
            for (let y = 0; y < this.height; ++y) {
                fn(x, y, this.cells[x][y]);
            }
        }
    }
    
    
    public forEachInRadius(startX: number, startY: number, radius: number, fn: (x: number, y: number, cell: IncrementalGridCell<T>, dist: number) => void) {
        for (
            let x: number = Math.max(0, startX - radius);
            x < Math.min(this.width, startX + radius);
            ++x
        ) {
            for (
                let y: number = Math.max(0, startY - radius);
                y < Math.min(this.height, startY + radius);
                ++y
            ) {
                const cell = this.getCell(x, y);
                if (!cell) {
                    continue;
                }
                const distance = GameMath.sqrt(GameMath.pow(x - startX, 2) + GameMath.pow(y - startY, 2));
                fn(x, y, cell, distance);
            }
        }
    }

    public _renderScale() {
        return 1;
    }
}

export interface IncrementalGridCacheUpdateStrategy {
    getNextCellToUpdate(width: number, height: number): { x: number; y: number } | null;
}

// Dumb scan strategy: top-left to bottom-right.
export class SequentialScanStrategy implements IncrementalGridCacheUpdateStrategy {
    private lastUpdatedSectorX: number | undefined;
    private lastUpdatedSectorY: number | undefined;

    getNextCellToUpdate(width: number, height: number) {
        if (this.lastUpdatedSectorX === undefined || this.lastUpdatedSectorY === undefined) {
            this.lastUpdatedSectorX = 0;
            this.lastUpdatedSectorY = 0;
            return { x: 0, y: 0 };
        }

        if (this.lastUpdatedSectorX < width - 1) {
            this.lastUpdatedSectorX++;
            return { x: this.lastUpdatedSectorX, y: this.lastUpdatedSectorY };
        }

        if (this.lastUpdatedSectorY < height - 1) {
            this.lastUpdatedSectorX = 0;
            this.lastUpdatedSectorY++;
            return { x: 0, y: this.lastUpdatedSectorY };
        }

        this.lastUpdatedSectorX = undefined;
        this.lastUpdatedSectorY = undefined;
        return null;
    }
}