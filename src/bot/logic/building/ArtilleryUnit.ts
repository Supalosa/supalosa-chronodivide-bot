import { GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { AiBuildingRules, getDefaultPlacementLocation, numBuildingsOwnedOfType } from "./buildingRules.js";

export class ArtilleryUnit implements AiBuildingRules {
    constructor(private basePriority: number, private baseAmount: number) {}

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
        threatCache: GlobalThreat | null
    ): number {
        // If the enemy's defensive power is increasing we will start to build these.
        if (threatCache) {
            if (threatCache.totalDefensivePower > threatCache.totalAvailableAntiGroundFirepower) {
                return (
                    this.basePriority *
                    (threatCache.totalAvailableAntiGroundFirepower / Math.max(1, threatCache.totalDefensivePower))
                );
            }
        }
        const numOwned = numBuildingsOwnedOfType(game, playerData, technoRules);
        return this.basePriority * (1.0 - numOwned / this.baseAmount);
    }

    getMaxCount(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | null
    ): number | null {
        return null;
    }
}
