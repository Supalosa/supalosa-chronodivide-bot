import { GameApi, GameObjectData, LandType, SpeedType, TerrainType, Tile } from "@chronodivide/game-api";

const FLAT_RAMP_TYPE = 0;

/**
 * Return true if the given tile could be built on (not including other things being there already). This is purely based on static map information.
 */
function tileIsBuildable(tile: Tile) {
    return (
        tile.rampType === FLAT_RAMP_TYPE &&
        (tile.terrainType === TerrainType.Clear ||
            tile.terrainType === TerrainType.Pavement ||
            tile.terrainType === TerrainType.Default ||
            tile.terrainType === TerrainType.Shore ||
            tile.terrainType === TerrainType.Rock1 ||
            tile.terrainType === TerrainType.Rock2 ||
            tile.terrainType === TerrainType.Rough ||
            tile.terrainType === TerrainType.Railroad ||
            tile.terrainType === TerrainType.Dirt)
    );
}

/**
 * As above, but consider if there is something on the tile.
 * @param tile
 */
function tileIsOccupied(tile: Tile, gameApi: GameApi) {
    if (tile.landType === LandType.Tiberium) {
        return true;
    }
    // Proxy for "can I build something or is there something there"
    return !gameApi.map.isPassableTile(tile, SpeedType.Track, false, false);
}

export function canBuildOnTile(tile: Tile, gameApi: GameApi) {
    return tileIsBuildable(tile) && !tileIsOccupied(tile, gameApi);
}
