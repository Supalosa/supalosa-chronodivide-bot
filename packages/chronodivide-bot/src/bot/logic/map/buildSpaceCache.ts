import { GameApi, Size, TerrainType, Tile, Vector2 } from "@chronodivide/game-api";
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

// distance transform to find flat, buildable areas.
// ref: https://github.com/Supalosa/supabot/blob/1ce77f3c3e210da738bf231bc6a94aa8bdf68cef/supabot-core/src/main/java/com/supalosa/bot/analysis/Analysis.java#L252
export class BuildSpaceCache {
    private scanStrategy: StagedScanStrategy;
    private distanceTransformCache: BasicIncrementalGridCache<number, number>;

    constructor(mapSize: Size, gameApi: GameApi, diagonalMapBounds: DiagonalMapBounds) {
        // The DT algorithm runs in 3 passes. The last pass needs to run in reverse.
        this.scanStrategy = new StagedScanStrategy(
            [new SequentialScanStrategy(1, diagonalMapBounds),
            new SequentialScanStrategy(1, diagonalMapBounds),
            new SequentialScanStrategy(1, diagonalMapBounds).setReverse(),
            ]);
        this.distanceTransformCache = new BasicIncrementalGridCache<number, number>(
            mapSize.width,
            mapSize.height,
            () => Number.MAX_VALUE,
            (x, y, _currentValue, stageIndex) => {
                if (stageIndex === 0) {
                    // First pass: set unbuildable tiles as distance 0
                    const tile = gameApi.mapApi.getTile(x, y);
                    if (!tile) {
                        return 0;
                    }
                    return tileIsBuildable(tile) ? Number.MAX_VALUE : 0;
                }
                const { value: prevValue } = this.distanceTransformCache.getCell(x, y)!;

                if (stageIndex === 1) {
                    // Second pass: all cells (except edges) update from top left
                    if (x === 0 || y === 0) {
                        return prevValue;
                    }
                    const left = this.distanceTransformCache.getCell(x - 1, y)!;
                    const top = this.distanceTransformCache.getCell(x, y - 1)!;
                    return Math.min(
                        prevValue,
                        Math.min(left.value + 1, top.value + 1)
                    );
                }
                // Last pass: all cells update from bottom right
                if (x === mapSize.width - 1 || y === mapSize.height - 1) {
                    return prevValue;
                }
                const right = this.distanceTransformCache.getCell(x + 1, y)!;
                const bottom = this.distanceTransformCache.getCell(x, y + 1)!;
                return Math.min(
                    prevValue,
                    Math.min(right.value + 1, bottom.value + 1)
                );
            },
            this.scanStrategy,
            (v) => toHeatmapColor(Math.min(15, v), 0, 15)
        );
    }

    public update(gameTick: number) {
        this.distanceTransformCache.updateCells(256, gameTick);
    }

    // visible for debugging
    public get _cache(): IncrementalGridCache<number> {
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
            if (cell.value >= tiles) {
                // if there's a candidate within `tiles` distance, use the higher of the two
                const vec = new Vector2(x, y);
                const otherCandidateIdx = candidates.findIndex((c) => c.pos.distanceTo(vec) < tiles);
                if (otherCandidateIdx >= 0) {
                    if (candidates[otherCandidateIdx].value < cell.value) {
                        candidates[otherCandidateIdx] = { pos: vec, value: cell.value };
                    }
                } else {
                    candidates.push({ pos: vec, value: cell.value });
                }
            }
        });
        return candidates.map(({ pos }) => pos);
    }
}