import { GameApi, GameMath, PlayerData, TechnoRules, Tile } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { BasicBuilding } from "./basicBuilding.js";
import { getDefaultPlacementLocation } from "./buildingRules.js";
import { Vector2 } from "three";

export class ResourceCollectionBuilding extends BasicBuilding {
    constructor(basePriority: number, maxNeeded: number, onlyBuildWhenFloatingCreditsAmount?: number) {
        super(basePriority, maxNeeded, onlyBuildWhenFloatingCreditsAmount);
    }

    getPlacementLocation(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
    ): { rx: number; ry: number } | undefined {
        // Prefer spawning close to ore.
        let selectedLocation = playerData.startLocation;

        var closeOre: Tile | undefined;
        var closeOreDist: number | undefined;
        let allTileResourceData = game.mapApi.getAllTilesResourceData();
        for (let i = 0; i < allTileResourceData.length; ++i) {
            let tileResourceData = allTileResourceData[i];
            if (tileResourceData.spawnsOre) {
                let dist = GameMath.sqrt(
                    (selectedLocation.x - tileResourceData.tile.rx) ** 2 +
                        (selectedLocation.y - tileResourceData.tile.ry) ** 2,
                );
                if (closeOreDist == undefined || dist < closeOreDist) {
                    closeOreDist = dist;
                    closeOre = tileResourceData.tile;
                }
            }
        }
        if (closeOre) {
            selectedLocation = new Vector2(closeOre.rx, closeOre.ry);
        }
        return getDefaultPlacementLocation(game, playerData, selectedLocation, technoRules);
    }

    // Don't build/start selling these if we don't have any harvesters
    getMaxCount(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | null,
    ): number | null {
        const harvesters = game.getVisibleUnits(playerData.name, "self", (r) => r.harvester).length;
        return Math.max(1, harvesters * 2);
    }
}
