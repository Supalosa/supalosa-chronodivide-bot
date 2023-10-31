import {
    BuildingPlacementData,
    GameApi,
    ObjectType,
    PlayerData,
    Point2D,
    Size,
    TechnoRules,
    Tile,
} from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { AntiGroundStaticDefence } from "./antiGroundStaticDefence.js";
import { ArtilleryUnit } from "./artilleryUnit.js";
import { BasicAirUnit } from "./basicAirUnit.js";
import { BasicBuilding } from "./basicBuilding.js";
import { BasicGroundUnit } from "./basicGroundUnit.js";
import { PowerPlant } from "./powerPlant.js";
import { ResourceCollectionBuilding } from "./resourceCollectionBuilding.js";
import { Harvester } from "./harvester.js";
import uniqBy from "lodash.uniqby";

export interface AiBuildingRules {
    getPriority(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | null,
    ): number;

    getPlacementLocation(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
    ): { rx: number; ry: number } | undefined;

    getMaxCount(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | null,
    ): number | null;
}

export function numBuildingsOwnedOfType(game: GameApi, playerData: PlayerData, technoRules: TechnoRules): number {
    return game.getVisibleUnits(playerData.name, "self", (r) => r == technoRules).length;
}

export function numBuildingsOwnedOfName(game: GameApi, playerData: PlayerData, name: string): number {
    return game.getVisibleUnits(playerData.name, "self", (r) => r.name === name).length;
}

/**
 * Computes a rect 'centered' around a structure of a certain size with additional radius.
 *
 * This is essentially the placeable area around a given structure.
 *
 * @param point Top-left location of the inner rect.
 * @param t Size of the inner rect.
 * @param adjacent Size of the outer rect.
 * @returns
 */
function computeAdjacentRect(point: Point2D, t: Size, adjacent: number) {
    return {
        x: point.x - adjacent,
        y: point.y - adjacent,
        width: t.width + 2 * adjacent,
        height: t.height + 2 * adjacent,
    };
}

export function getAdjacencyTiles(
    game: GameApi,
    playerData: PlayerData,
    technoRules: TechnoRules,
    minimumSpace: number,
) {
    const placementRules = game.getBuildingPlacementData(technoRules.name);
    const { width: newBuildingWidth, height: newBuildingHeight } = placementRules.foundation;
    const tiles = [];
    const buildings = game.getVisibleUnits(playerData.name, "self", (r: TechnoRules) => r.type === ObjectType.Building);
    const removedTiles = new Set<string>();
    for (let buildingId of buildings) {
        const building = game.getUnitData(buildingId);
        if (building?.rules?.baseNormal) {
            const { foundation, tile } = building;
            const buildingBase = {
                x: tile.rx,
                y: tile.ry,
            };
            const buildingSize = {
                width: foundation?.width,
                height: foundation?.height,
            };
            const range = computeAdjacentRect(buildingBase, buildingSize, technoRules.adjacent);
            const baseTile = game.mapApi.getTile(range.x, range.y);
            if (!baseTile) {
                continue;
            }
            const adjacentTiles = game.mapApi.getTilesInRect(baseTile, {
                width: range.width,
                height: range.height,
            });
            tiles.push(...adjacentTiles);

            // Prevent placing the new building on tiles that would cause it to overlap with this building.
            const modifiedBase = {
                x: buildingBase.x - (newBuildingWidth - 1),
                y: buildingBase.y - (newBuildingHeight - 1),
            };
            const modifiedSize = {
                width: buildingSize.width + (newBuildingWidth - 1),
                height: buildingSize.height + (newBuildingHeight - 1),
            };
            const blockedRect = computeAdjacentRect(modifiedBase, modifiedSize, minimumSpace);
            const buildingTiles = adjacentTiles.filter((tile) => {
                return (
                    tile.rx >= blockedRect.x &&
                    tile.rx < blockedRect.x + blockedRect.width &&
                    tile.ry >= blockedRect.y &&
                    tile.ry < blockedRect.y + blockedRect.height
                );
            });
            buildingTiles.forEach((buildingTile) => removedTiles.add(buildingTile.id));
        }
    }
    // Remove duplicate tiles.
    const withDuplicatesRemoved = uniqBy(tiles, (tile) => tile.id);
    // Remove tiles containing buildings and potentially area around them removed as well.
    return withDuplicatesRemoved.filter((tile) => !removedTiles.has(tile.id));
}

function getTileDistances(startPoint: Point2D, tiles: Tile[]) {
    return tiles
        .map((tile) => ({
            tile,
            distance: distance(tile.rx, tile.ry, startPoint.x, startPoint.y),
        }))
        .sort((a, b) => {
            return a.distance - b.distance;
        });
}

function distance(x1: number, y1: number, x2: number, y2: number) {
    var dx = x1 - x2;
    var dy = y1 - y2;
    let tmp = dx * dx + dy * dy;
    if (0 === tmp) {
        return 0;
    }
    return Math.sqrt(tmp);
}

export function getDefaultPlacementLocation(
    game: GameApi,
    playerData: PlayerData,
    startPoint: Point2D,
    technoRules: TechnoRules,
    minSpace: number = 1,
): { rx: number; ry: number } | undefined {
    // Random location, preferably near start location.
    const size: BuildingPlacementData = game.getBuildingPlacementData(technoRules.name);
    if (!size) {
        return undefined;
    }
    const tiles = getAdjacencyTiles(game, playerData, technoRules, minSpace);
    const tileDistances = getTileDistances(startPoint, tiles);

    for (let tileDistance of tileDistances) {
        if (tileDistance.tile && game.canPlaceBuilding(playerData.name, technoRules.name, tileDistance.tile)) {
            return tileDistance.tile;
        }
    }
    return undefined;
}

// Priority 0 = don't build.
export type TechnoRulesWithPriority = { unit: TechnoRules; priority: number };

export const DEFAULT_BUILDING_PRIORITY = 1;

export const BUILDING_NAME_TO_RULES = new Map<string, AiBuildingRules>([
    // Allied
    ["GAPOWR", new PowerPlant()],
    ["GAREFN", new ResourceCollectionBuilding(10, 3)], // Refinery
    ["GAWEAP", new BasicBuilding(15, 1)], // War Factory
    ["GAPILE", new BasicBuilding(12, 1)], // Barracks
    ["CMIN", new Harvester(15, 4, 2)], // Chrono Miner
    ["ENGINEER", new BasicBuilding(10, 1, 1000)], // Engineer
    ["GADEPT", new BasicBuilding(1, 1, 10000)], // Repair Depot
    ["GAAIRC", new BasicBuilding(10, 1, 500)], // Airforce Command

    ["GATECH", new BasicBuilding(20, 1, 4000)], // Allied Battle Lab
    ["GAYARD", new BasicBuilding(0, 0, 0)], // Naval Yard, disabled

    ["GAPILL", new AntiGroundStaticDefence(5, 1, 5)], // Pillbox
    ["ATESLA", new AntiGroundStaticDefence(5, 1, 10)], // Prism Cannon
    ["GAWALL", new AntiGroundStaticDefence(0, 0, 0)], // Walls

    ["E1", new BasicGroundUnit(2, 3, 0.25, 0)], // GI
    ["MTNK", new BasicGroundUnit(10, 3, 2, 0)], // Grizzly Tank
    ["MGTK", new BasicGroundUnit(10, 1, 2.5, 0)], // Mirage Tank
    ["FV", new BasicGroundUnit(5, 2, 0.5, 1)], // IFV
    ["JUMPJET", new BasicAirUnit(10, 1, 1, 1)], // Rocketeer
    ["ORCA", new BasicAirUnit(7, 1, 2, 0)], // Rocketeer
    ["SREF", new ArtilleryUnit(10, 5, 3, 3)], // Prism Tank
    ["CLEG", new BasicGroundUnit(0, 0)], // Chrono Legionnaire (Disabled - we don't handle the warped out phase properly and it tends to bug both bots out)
    ["SHAD", new BasicGroundUnit(0, 0)], // Nighthawk (Disabled)

    // Soviet
    ["NAPOWR", new PowerPlant()],
    ["NAREFN", new ResourceCollectionBuilding(10, 3)], // Refinery
    ["NAWEAP", new BasicBuilding(15, 1)], // War Factory
    ["NAHAND", new BasicBuilding(12, 1)], // Barracks
    ["HARV", new Harvester(15, 4, 2)], // War Miner
    ["SENGINEER", new BasicBuilding(10, 1, 1000)], // Soviet Engineer
    ["NADEPT", new BasicBuilding(1, 1, 10000)], // Repair Depot
    ["NARADR", new BasicBuilding(10, 1, 500)], // Radar
    ["NANRCT", new PowerPlant()], // Nuclear Reactor
    ["NAYARD", new BasicBuilding(0, 0, 0)], // Naval Yard, disabled

    ["NATECH", new BasicBuilding(20, 1, 4000)], // Soviet Battle Lab

    ["NALASR", new AntiGroundStaticDefence(5, 1, 5)], // Sentry Gun
    ["TESLA", new AntiGroundStaticDefence(5, 1, 10)], // Tesla Coil
    ["NAWALL", new AntiGroundStaticDefence(0, 0, 0)], // Walls

    ["E2", new BasicGroundUnit(2, 3, 0.25, 0)], // Conscript
    ["HTNK", new BasicGroundUnit(10, 3, 3, 0)], // Rhino Tank
    ["APOC", new BasicGroundUnit(6, 1, 5, 0)], // Apocalypse Tank
    ["HTK", new BasicGroundUnit(5, 2, 0.33, 1.5)], // Flak Track
    ["ZEP", new BasicAirUnit(5, 1, 5, 1)], // Kirov
    ["V3", new ArtilleryUnit(9, 10, 0, 3)], // V3 Rocket Launcher
]);
