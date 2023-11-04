import { GameApi, GameMath, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { AiBuildingRules, getDefaultPlacementLocation, numBuildingsOwnedOfType } from "./buildingRules.js";

export class BasicGroundUnit implements AiBuildingRules {
    constructor(
        protected basePriority: number,
        protected baseAmount: number,
        protected antiGroundPower: number = 1, // boolean for now, but will eventually be used in weighting.
        protected antiAirPower: number = 0,
    ) {}

    getPlacementLocation(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
    ): { rx: number; ry: number } | undefined {
        return undefined;
    }

    getPriority(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | null,
    ): number {
        const numOwned = numBuildingsOwnedOfType(game, playerData, technoRules);
        if (threatCache) {
            let priority = this.basePriority;
            if (this.antiGroundPower > 0) {
                // If the enemy's power is increasing we should try to keep up.
                if (threatCache.totalOffensiveLandThreat > threatCache.totalAvailableAntiGroundFirepower) {
                    priority +=
                        this.antiGroundPower *
                        this.basePriority *
                        (threatCache.totalOffensiveLandThreat /
                            Math.max(1, threatCache.totalAvailableAntiGroundFirepower));
                } else {
                    // But also, if our power dwarfs the enemy, keep pressing the advantage.
                    priority +=
                        (this.antiGroundPower *
                            this.basePriority *
                            GameMath.sqrt(
                                threatCache.totalAvailableAntiGroundFirepower /
                                    Math.max(
                                        1,
                                        threatCache.totalOffensiveLandThreat + threatCache.totalDefensiveThreat,
                                    ),
                            )) /
                        (numOwned + 1);
                }
            }
            if (this.antiAirPower > 0) {
                if (threatCache.totalOffensiveAirThreat > threatCache.totalAvailableAntiAirFirepower) {
                    priority +=
                        this.antiAirPower *
                        this.basePriority *
                        (threatCache.totalOffensiveAirThreat / Math.max(1, threatCache.totalAvailableAntiAirFirepower));
                } else {
                    priority +=
                        (this.antiAirPower *
                            this.basePriority *
                            GameMath.sqrt(
                                threatCache.totalAvailableAntiAirFirepower /
                                    Math.max(1, threatCache.totalOffensiveAirThreat + threatCache.totalDefensiveThreat),
                            )) /
                        (numOwned + 1);
                }
            }
            return priority;
        }
        return this.basePriority * (1.0 - numOwned / this.baseAmount);
    }

    getMaxCount(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | null,
    ): number | null {
        return null;
    }
}
