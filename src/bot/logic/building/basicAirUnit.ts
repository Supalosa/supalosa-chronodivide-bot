import { GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { AiBuildingRules, getDefaultPlacementLocation, numBuildingsOwnedOfType } from "./building.js";

export class BasicAirUnit implements AiBuildingRules {
    
    constructor(
        private basePriority: number,
        private baseAmount: number,
        private antiGroundPower: number = 1, // boolean for now, but will eventually be used in weighting.
        private antiAirPower: number = 0,
    ) {}

    getPlacementLocation(game: GameApi, playerData: PlayerData, technoRules: TechnoRules): { rx: number; ry: number; } | undefined {
        return undefined;
    }

    getPriority(game: GameApi, playerData: PlayerData, technoRules: TechnoRules, threatCache: GlobalThreat | undefined): number {
        // If the enemy's anti-air power is low we might build more.
        if (threatCache) {
            let priority = 0
            if (this.antiGroundPower > 0 && threatCache.totalOffensiveLandThreat > threatCache.totalAvailableAntiGroundFirepower) {
                priority += this.basePriority * (threatCache.totalOffensiveLandThreat / Math.max(1, threatCache.totalAvailableAntiGroundFirepower));
            }
            if (this.antiAirPower > 0 && threatCache.totalOffensiveAirThreat > threatCache.totalAvailableAntiAirFirepower) {
                priority += this.basePriority * (threatCache.totalOffensiveAirThreat / Math.max(1, threatCache.totalAvailableAntiAirFirepower));
            }
            // sqrt so we don't build too much of one unit type.
            priority += Math.min(1.0, Math.max(1, Math.sqrt(threatCache.totalAvailableAirPower / Math.max(1, threatCache.totalOffensiveAntiAirThreat))));
            return this.baseAmount * priority;
        }
        const numOwned = numBuildingsOwnedOfType(game, playerData, technoRules);
        return this.basePriority * (1.0 - (numOwned/this.baseAmount));
    }
}