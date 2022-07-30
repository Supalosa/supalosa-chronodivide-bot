import { GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { AiBuildingRules, getDefaultPlacementLocation, numBuildingsOwnedOfType } from "./building.js";

export class MassedAntiGroundUnit implements AiBuildingRules {
    
    constructor(
        private basePriority: number,
        private baseAmount: number,
    ) {}

    getPlacementLocation(game: GameApi, playerData: PlayerData, technoRules: TechnoRules): { rx: number; ry: number; } | undefined {
        return undefined;
    }

    getPriority(game: GameApi, playerData: PlayerData, technoRules: TechnoRules, threatCache: GlobalThreat | undefined): number {
        // If the enemy's ground power is increasing we should try to keep up.
        if (threatCache) {
            if (threatCache.totalAvailableAntiGroundFirepower * threatCache.certainty > threatCache.totalAvailableAntiGroundFirepower) {
                return this.basePriority * (threatCache.totalAvailableAntiGroundFirepower / Math.max(1, threatCache.totalAvailableAntiGroundFirepower));
            }
        }
        const numOwned = numBuildingsOwnedOfType(game, playerData, technoRules);
        return this.basePriority * (1.0 - (numOwned/this.baseAmount));
    }
}