import { GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { AiBuildingRules, getDefaultPlacementLocation, numBuildingsOwnedOfType } from "./buildingRules.js";

export class ArtilleryUnit implements AiBuildingRules {
    constructor(private basePriority: number,
        private artilleryPower: number,
        private antiGroundPower: number,
        private baseAmount: number) {}

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
        const numOwned = numBuildingsOwnedOfType(game, playerData, technoRules);
        let priority = this.basePriority;
        // If the enemy's defensive power is increasing we will start to build these.
        if (threatCache && threatCache.totalDefensivePower > threatCache.totalAvailableAntiGroundFirepower) {
            priority += (
                this.artilleryPower *
                (threatCache.totalAvailableAntiGroundFirepower / Math.max(1, threatCache.totalDefensivePower))
            );
        }
        if (threatCache && this.antiGroundPower > 0) {
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
                        Math.sqrt(
                            threatCache.totalAvailableAntiGroundFirepower /
                                Math.max(
                                    1,
                                    threatCache.totalOffensiveLandThreat + threatCache.totalDefensiveThreat,
                                ),
                        )) /
                    (numOwned + 1);
            }
        }
        return priority * (1.0 - numOwned / this.baseAmount);
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
