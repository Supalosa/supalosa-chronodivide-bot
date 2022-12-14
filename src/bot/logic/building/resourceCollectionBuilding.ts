import { GameApi, PlayerData, Point2D, TechnoRules, Tile } from "@chronodivide/game-api";
import { randomBytes } from "crypto";
import { GlobalThreat } from "../threat/threat.js";
import { BasicBuilding } from "./basicBuilding.js";
import { AiBuildingRules, getDefaultPlacementLocation, numBuildingsOwnedOfType } from "./building.js";

export class ResourceCollectionBuilding extends BasicBuilding {
    
    constructor(
        basePriority: number,
        maxNeeded: number,
        onlyBuildWhenFloatingCreditsAmount?: number
    ) {
        super(basePriority, maxNeeded, onlyBuildWhenFloatingCreditsAmount);
    }

    getPlacementLocation(game: GameApi, playerData: PlayerData, technoRules: TechnoRules): { rx: number; ry: number; } | undefined {
        // Prefer spawning close to ore.
        let selectedLocation = playerData.startLocation;

        var closeOre: Tile | undefined;
        var closeOreDist: number | undefined;
        let allTileResourceData = game.mapApi.getAllTilesResourceData();
        for (let i = 0; i < allTileResourceData.length; ++i) {
            let tileResourceData = allTileResourceData[i];
            if (tileResourceData.spawnsOre) {
                let dist = Math.sqrt((selectedLocation.x - tileResourceData.tile.rx)**2 + (selectedLocation.y - tileResourceData.tile.ry)**2);
                if(closeOreDist == undefined || dist < closeOreDist) {
                    closeOreDist = dist;
                    closeOre = tileResourceData.tile;
                }
            }
        }
        if (closeOre) {
            selectedLocation = {x: closeOre.rx, y: closeOre.ry};
        }
        return getDefaultPlacementLocation(game, playerData, selectedLocation, technoRules);
    }
}