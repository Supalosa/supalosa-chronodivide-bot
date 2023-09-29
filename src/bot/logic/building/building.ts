import {
  BuildingPlacementData,
  GameApi,
  PlayerData,
  Point2D,
  TechnoRules,
} from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { AntiGroundStaticDefence } from "./antiGroundStaticDefence.js";
import { ArtilleryUnit } from "./ArtilleryUnit.js";
import { BasicAirUnit } from "./basicAirUnit.js";
import { BasicBuilding } from "./basicBuilding.js";
import { BasicGroundUnit } from "./basicGroundUnit.js";
import { PowerPlant } from "./powerPlant.js";
import { ResourceCollectionBuilding } from "./resourceCollectionBuilding.js";

export interface AiBuildingRules {
  getPriority(
    game: GameApi,
    playerData: PlayerData,
    technoRules: TechnoRules,
    threatCache: GlobalThreat | undefined,
  ): number;

  getPlacementLocation(
    game: GameApi,
    playerData: PlayerData,
    technoRules: TechnoRules,
  ): { rx: number; ry: number } | undefined;
}

export function numBuildingsOwnedOfType(
  game: GameApi,
  playerData: PlayerData,
  technoRules: TechnoRules,
): number {
  return game.getVisibleUnits(playerData.name, "self", (r) => r == technoRules)
    .length;
}

export function getDefaultPlacementLocation(
  game: GameApi,
  playerData: PlayerData,
  startPoint: Point2D,
  technoRules: TechnoRules,
  space: number = 1,
): { rx: number; ry: number } | undefined {
  // Random location, preferably near start location.
  let startX = startPoint.x;
  let startY = startPoint.y;
  let size: BuildingPlacementData = game.getBuildingPlacementData(
    technoRules.name,
  );
  if (!size) {
    return undefined;
  }
  let largestSize = Math.max(size.foundation.height, size.foundation.width);
  for (
    let searchRadius = largestSize;
    searchRadius < 25 + largestSize;
    ++searchRadius
  ) {
    for (let xx = startX - searchRadius; xx < startX + searchRadius; ++xx) {
      for (let yy = startY - searchRadius; yy < startY + searchRadius; ++yy) {
        let tile = game.mapApi.getTile(xx, yy);
        if (
          tile &&
          game.canPlaceBuilding(playerData.name, technoRules.name, tile)
        ) {
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

export const defaultBuildingPriority = 1;

export const buildingNameToAiBuildingRules = new Map<string, AiBuildingRules>([
  ["GAPOWR", new PowerPlant()],
  ["GAREFN", new ResourceCollectionBuilding(9, 3)], // Refinery
  ["GAWEAP", new BasicBuilding(10, 1)], // War Factory
  ["GAPILE", new BasicBuilding(10, 1)], // Barracks
  ["CMIN", new BasicBuilding(20, 3)], // Chrono Miner
  ["ENGINEER", new BasicBuilding(1, 1, 10000)], // Engineer
  ["GADEPT", new BasicBuilding(1, 1, 10000)], // Repair Depot
  ["GAAIRC", new BasicBuilding(10, 1, 6000)], // Airforce Command

  ["GAPILL", new AntiGroundStaticDefence(5, 1)], // Pillbox

  ["E1", new BasicGroundUnit(5, 3, 0.25, 0)], // GI
  ["MTNK", new BasicGroundUnit(10, 3, 2, 0)], // Grizzly Tank
  ["FV", new BasicGroundUnit(5, 2, 0.5, 1)], // IFV
  ["JUMPJET", new BasicAirUnit(10, 1, 1, 1)], // Rocketeer
  ["SREF", new ArtilleryUnit(9, 1)], // Prism Tank
  ["CLEG", new BasicGroundUnit(0, 0)], // Chrono Legionnaire (Disabled)
  ["SHAD", new BasicGroundUnit(0, 0)], // Nighthawk (Disabled)
]);
