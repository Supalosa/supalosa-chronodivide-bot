import { GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { AiBuildingRules, getDefaultPlacementLocation } from "./buildingRules.js";
import { BasicBuilding } from "./basicBuilding.js";
import { GlobalThreat } from "../threat/threat.js";

export class NavalYard extends BasicBuilding {
    constructor(
        basePriority: number, 
        maxNeeded: number, 
        onlyBuildWhenFloatingCreditsAmount?: number,
    ) {
        super(basePriority, maxNeeded, onlyBuildWhenFloatingCreditsAmount);
    }

    override getPlacementLocation(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
    ): { rx: number; ry: number } | undefined {
        // Use default placement logic, but specify it must be on water
        const location = getDefaultPlacementLocation(game, playerData, playerData.startLocation, technoRules, true, 1);

        return location;
    }

    override getPriority(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | null,
    ): number {
        const priority = super.getPriority(game, playerData, technoRules, threatCache);
        return priority;
    }
} 