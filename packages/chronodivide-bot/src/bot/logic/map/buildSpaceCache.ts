import { GameApi, LandType, Size, TerrainType, Tile, Vector2 } from "@chronodivide/game-api";
import { BasicIncrementalGridCache, DiagonalMapBounds, getDiagonalMapBounds, IncrementalGridCache, SequentialScanStrategy, StagedScanStrategy, toHeatmapColor } from "./incrementalGridCache.js";


const FLAT_RAMP_TYPE = 0;

/**
 * Return true if the given tile could be built on (not including other things being there already)
 */
function tileIsBuildable(tile: Tile) {
    return tile.rampType === FLAT_RAMP_TYPE &&
        (tile.terrainType === TerrainType.Clear ||
            tile.terrainType === TerrainType.Pavement ||
            tile.terrainType === TerrainType.Default ||
            tile.terrainType === TerrainType.Shore ||
            tile.terrainType === TerrainType.Rock1 ||
            tile.terrainType === TerrainType.Rock2 ||
            tile.terrainType === TerrainType.Rough ||
            tile.terrainType === TerrainType.Railroad ||
            tile.terrainType === TerrainType.Dirt);
}

/**
 * As above, but consider if there is something on the tile.
 * @param tile 
 */
function tileIsOccupied(tile: Tile) {
    return tile.landType === LandType.Tiberium;
}

type BuildSpaceData = {
    // number from raw map data
    rawValue: number;
    // number given actual objects on the field
    liveValue: number;
}

// distance transform to find flat, buildable areas.
// ref: https://github.com/Supalosa/supabot/blob/1ce77f3c3e210da738bf231bc6a94aa8bdf68cef/supabot-core/src/main/java/com/supalosa/bot/analysis/Analysis.java#L252
export class BuildSpaceCache {
    private scanStrategy: StagedScanStrategy;
    private distanceTransformCache: BasicIncrementalGridCache<BuildSpaceData, number>;

    constructor(mapSize: Size, gameApi: GameApi, diagonalMapBounds: DiagonalMapBounds) {
        this.scanStrategy = new StagedScanStrategy(
            [
                // The DT algorithm runs in 3 passes. The last pass needs to run in reverse.
                new SequentialScanStrategy(1, diagonalMapBounds),
                new SequentialScanStrategy(1, diagonalMapBounds),
                new SequentialScanStrategy(1, diagonalMapBounds).setReverse(),
                // And from this point we're using live game values
                new SequentialScanStrategy(null, diagonalMapBounds),
            ]);
        this.distanceTransformCache = new BasicIncrementalGridCache<BuildSpaceData, number>(
            mapSize.width,
            mapSize.height,
            () => ({
                rawValue: Number.MAX_VALUE,
                liveValue: Number.MAX_VALUE,
            }),
            (x, y, currentValue, stageIndex) => {
                if (stageIndex === 0) {
                    // First DT pass: set unbuildable tiles as distance 0
                    const tile = gameApi.mapApi.getTile(x, y);
                    if (!tile) {
                        return {
                            rawValue: 0,
                            liveValue: 0,
                        };
                    }
                    const initialValue = tileIsBuildable(tile) ? Number.MAX_VALUE : 0;
                    return {
                        rawValue: initialValue,
                        liveValue: initialValue
                    };
                }

                if (stageIndex === 1) {
                    // Second DT pass: all cells (except edges) update from top left
                    if (x === 0 || y === 0) {
                        return currentValue;
                    }
                    const left = this.distanceTransformCache.getCell(x - 1, y)!;
                    const top = this.distanceTransformCache.getCell(x, y - 1)!;
                    return {
                        ...currentValue,
                        rawValue: Math.min(
                            currentValue.rawValue,
                            Math.min(left.value.rawValue + 1, top.value.rawValue + 1)
                        ),
                    }
                }
                // Last DT pass: all cells update from bottom right
                if (stageIndex === 2) {
                    if (x === mapSize.width - 1 || y === mapSize.height - 1) {
                        return currentValue;
                    }
                    const right = this.distanceTransformCache.getCell(x + 1, y)!;
                    const bottom = this.distanceTransformCache.getCell(x, y + 1)!;
                    const rawValue = Math.min(
                            currentValue.rawValue,
                            Math.min(right.value.rawValue + 1, bottom.value.rawValue + 1));
                    return {
                        rawValue,
                        // future passes will adjust this
                        liveValue: rawValue
                    };
                }
                // Infinite scan: remove cells with stuff on them.
                const tile = gameApi.mapApi.getTile(x, y)!; // We assume if we got here, the tile exists...
                const isOccupied = tileIsOccupied(tile);
                return {
                    ...currentValue,
                    liveValue: isOccupied ? 0 : currentValue.rawValue
                };
            },
            this.scanStrategy,
            (v) => toHeatmapColor(Math.min(15, v.liveValue ?? v.rawValue), 0, 15)
        );
    }

    public update(gameTick: number) {
        this.distanceTransformCache.updateCells(this.isFinished() ? 128 : 256, gameTick);
    }

    // visible for debugging
    public get _cache(): IncrementalGridCache<BuildSpaceData> {
        return this.distanceTransformCache;
    }

    public isFinished() {
        return this.scanStrategy.isFinished();
    }

    public findSpace(tiles: number): Vector2[] {
        if (!this.isFinished()) {
            return [];
        }
        type Candidate = {
            pos: Vector2;
            value: number;
        }
        const candidates: Candidate[] = [];
        this.distanceTransformCache.forEach((x, y, cell) => {
            if (cell.lastUpdatedTick === null) {
                return;
            }
            // we know it has a value if the scan is 'finished'
            const liveValue = cell.value.liveValue!;
            if (liveValue >= tiles) {
                // if there's a candidate within `tiles` distance, use the higher of the two
                const vec = new Vector2(x, y);
                const otherCandidateIdx = candidates.findIndex((c) => c.pos.distanceTo(vec) < tiles);
                if (otherCandidateIdx >= 0) {
                    if (candidates[otherCandidateIdx].value < liveValue) {
                        candidates[otherCandidateIdx] = { pos: vec, value: liveValue };
                    }
                } else {
                    candidates.push({ pos: vec, value: liveValue });
                }
            }
        });
        return candidates.map(({ pos }) => pos);
    }
}