import { GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { AiBuildingRules, getDefaultPlacementLocation, numBuildingsOwnedOfType } from "./building.js";

export class BasicGroundUnit implements AiBuildingRules {
    constructor(
        protected basePriority: number,
        protected baseAmount: number,
        protected antiGroundPower: number = 1, // boolean for now, but will eventually be used in weighting.
        protected antiAirPower: number = 0
    ) {}

    getPlacementLocation(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules
    ): { rx: number; ry: number } | undefined {
        return undefined;
    }

    getPriority(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | undefined
    ): number {
        // If the enemy's power is increasing we should try to keep up.
        if (threatCache) {
            let priority = 0;
            if (
                this.antiGroundPower > 0 &&
                threatCache.totalOffensiveLandThreat > threatCache.totalAvailableAntiGroundFirepower
            ) {
                let ratio = this.antiGroundPower;
                priority +=
                    ratio *
                    this.basePriority *
                    (threatCache.totalOffensiveLandThreat / Math.max(1, threatCache.totalAvailableAntiGroundFirepower));
            }
            if (
                this.antiAirPower > 0 &&
                threatCache.totalOffensiveAirThreat > threatCache.totalAvailableAntiAirFirepower
            ) {
                let ratio = this.antiAirPower;
                priority +=
                    ratio *
                    this.basePriority *
                    (threatCache.totalOffensiveAirThreat / Math.max(1, threatCache.totalAvailableAntiAirFirepower));
            }
            return priority;
        }
        const numOwned = numBuildingsOwnedOfType(game, playerData, technoRules);
        return this.basePriority * (1.0 - numOwned / this.baseAmount);
    }

    getMaxCount(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | undefined
    ): number | null {
        return null;
    }
}
