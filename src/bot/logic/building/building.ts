import { BuildingPlacementData, GameApi, PlayerData, Point2D, TechnoRules } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { AntiGroundStaticDefence } from "./antiGroundStaticDefence.js";
import { ArtilleryUnit } from "./ArtilleryUnit.js";
import { BasicAirUnit } from "./basicAirUnit.js";
import { BasicBuilding } from "./basicBuilding.js";
import { BasicGroundUnit } from "./basicGroundUnit.js";
import { PowerPlant } from "./powerPlant.js";
import { ResourceCollectionBuilding } from "./resourceCollectionBuilding.js";
import { Harvester } from "./harvester.js";

export interface AiBuildingRules {
    getPriority(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | undefined
    ): number;

    getPlacementLocation(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules
    ): { rx: number; ry: number } | undefined;

    getMaxCount(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | undefined
    ): number | null;
}

export function numBuildingsOwnedOfType(game: GameApi, playerData: PlayerData, technoRules: TechnoRules): number {
    return game.getVisibleUnits(playerData.name, "self", (r) => r == technoRules).length;
}

export function numBuildingsOwnedOfName(game: GameApi, playerData: PlayerData, name: string): number {
    return game.getVisibleUnits(playerData.name, "self", (r) => r.name === name).length;
}

export function getDefaultPlacementLocation(
    game: GameApi,
    playerData: PlayerData,
    startPoint: Point2D,
    technoRules: TechnoRules,
    space: number = 1
): { rx: number; ry: number } | undefined {
    // Random location, preferably near start location.
    let startX = startPoint.x;
    let startY = startPoint.y;
    let size: BuildingPlacementData = game.getBuildingPlacementData(technoRules.name);
    if (!size) {
        return undefined;
    }
    let largestSize = Math.max(size.foundation.height, size.foundation.width);
    for (let searchRadius = largestSize; searchRadius < 25 + largestSize; ++searchRadius) {
        for (let xx = startX - searchRadius; xx < startX + searchRadius; ++xx) {
            for (let yy = startY - searchRadius; yy < startY + searchRadius; ++yy) {
                let tile = game.mapApi.getTile(xx, yy);
                if (tile && game.canPlaceBuilding(playerData.name, technoRules.name, tile)) {
                    return { rx: xx, ry: yy };
                }
            }
        }
    }
    console.log("Can't find a place to put the " + technoRules.name);
    return undefined;
}

// Priority 0 = don't build.
export type TechnoRulesWithPriority = { unit: TechnoRules; priority: number };

export const DEFAULT_BUILDING_PRIORITY = 1;

export const BUILDING_NAME_TO_RULES = new Map<string, AiBuildingRules>([
    // Allied
    ["GAPOWR", new PowerPlant()],
    ["GAREFN", new ResourceCollectionBuilding(10, 3)], // Refinery
    ["GAWEAP", new BasicBuilding(10, 1)], // War Factory
    ["GAPILE", new BasicBuilding(10, 1)], // Barracks
    ["CMIN", new Harvester(8, 3)], // Chrono Miner
    ["ENGINEER", new BasicBuilding(1, 1, 10000)], // Engineer
    ["GADEPT", new BasicBuilding(1, 1, 10000)], // Repair Depot
    ["GAAIRC", new BasicBuilding(10, 1, 6000)], // Airforce Command

    ["GAPILL", new AntiGroundStaticDefence(5, 1)], // Pillbox
    ["ATESLA", new AntiGroundStaticDefence(5, 1)], // Prism Cannon
    ["GAWALL", new AntiGroundStaticDefence(0, 0)], // Walls

    ["E1", new BasicGroundUnit(5, 3, 0.25, 0)], // GI
    ["MTNK", new BasicGroundUnit(10, 3, 2, 0)], // Grizzly Tank
    ["MGTK", new BasicGroundUnit(10, 1, 2.5, 0)], // Mirage Tank
    ["FV", new BasicGroundUnit(5, 2, 0.5, 1)], // IFV
    ["JUMPJET", new BasicAirUnit(10, 1, 1, 1)], // Rocketeer
    ["SREF", new ArtilleryUnit(9, 1)], // Prism Tank
    ["CLEG", new BasicGroundUnit(0, 0)], // Chrono Legionnaire (Disabled - we don't handle the warped out phase properly and it tends to bug both bots out)
    ["SHAD", new BasicGroundUnit(0, 0)], // Nighthawk (Disabled)

    // Soviet
    ["NAPOWR", new PowerPlant()],
    ["NAREFN", new ResourceCollectionBuilding(10, 3)], // Refinery
    ["NAWEAP", new BasicBuilding(10, 1)], // War Factory
    ["NAHAND", new BasicBuilding(10, 1)], // Barracks
    ["HARV", new Harvester(8, 3)], // War Miner
    ["SENGINEER", new BasicBuilding(1, 1, 10000)], // Soviet Engineer
    ["NADEPT", new BasicBuilding(1, 1, 10000)], // Repair Depot
    ["NARADR", new BasicBuilding(10, 1, 4000)], // Radar

    ["NALASR", new AntiGroundStaticDefence(5, 1)], // Sentry Gun
    ["TESLA", new AntiGroundStaticDefence(5, 1)], // Tesla Coil
    ["NAWALL", new AntiGroundStaticDefence(0, 0)], // Walls

    ["E2", new BasicGroundUnit(5, 3, 0.25, 0)], // Conscript
    ["HTNK", new BasicGroundUnit(10, 3, 3, 0)], // Rhino Tank
    ["APOC", new BasicGroundUnit(6, 1, 5, 0)], // Apocalypse Tank
    ["HTK", new BasicGroundUnit(5, 2, 0.33, 1.5)], // Flak Track
    ["ZEP", new BasicAirUnit(5, 1, 5, 1)], // Kirov
    ["V3", new ArtilleryUnit(9, 1)], // V3 Rocket Launcher
]);
