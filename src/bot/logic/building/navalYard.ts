import { GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { AiBuildingRules, getDefaultPlacementLocation } from "./buildingRules.js";
import { BasicBuilding } from "./basicBuilding.js";
import { GlobalThreat } from "../threat/threat.js";

export class NavalYard extends BasicBuilding {
    constructor(
        basePriority: number, 
        maxNeeded: number, 
        onlyBuildWhenFloatingCreditsAmount?: number,
        private logger: (message: string, sayInGame?: boolean) => void = () => {},
    ) {
        super(basePriority, maxNeeded, onlyBuildWhenFloatingCreditsAmount);
    }

    override getPlacementLocation(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
    ): { rx: number; ry: number } | undefined {
        // Get building dimension information
        const placementData = game.getBuildingPlacementData(technoRules.name);
        this.logger(`[NavalYard] Attempting to place naval yard ${technoRules.name}, size: ${placementData.foundation.width}x${placementData.foundation.height}`, true);

        // Use default placement logic, but specify it must be on water
        const location = getDefaultPlacementLocation(game, playerData, playerData.startLocation, technoRules, true, 1);
        
        if (location) {
            this.logger(`[NavalYard] Found suitable placement location: (${location.rx}, ${location.ry})`, true);
        } else {
            this.logger(`[NavalYard] No suitable placement location found`, true);
        }
        
        return location;
    }

    override getPriority(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | null,
    ): number {
        const priority = super.getPriority(game, playerData, technoRules, threatCache);
        if(priority !== -100){
            this.logger(`[NavalYard] Current build priority: ${priority}`, true);
        }
        return priority;
    }
} 