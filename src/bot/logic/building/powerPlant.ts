import { GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { AiBuildingRules, getDefaultPlacementLocation } from "./building.js";

export class PowerPlant implements AiBuildingRules {

    getPlacementLocation(game: GameApi, playerData: PlayerData, technoRules: TechnoRules): { rx: number; ry: number; } | undefined {
        return getDefaultPlacementLocation(game, playerData, playerData.startLocation, technoRules);
    }

    getPriority(game: GameApi, playerData: PlayerData, technoRules: TechnoRules): number {
        if (playerData.power.total < playerData.power.drain + 20) {
            return 100;
        } else {
            return 0;
        }        
    }
}