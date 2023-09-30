import { GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { AiBuildingRules, getDefaultPlacementLocation, numBuildingsOwnedOfType } from "./building.js";

export class BasicBuilding implements AiBuildingRules {
    constructor(
        private basePriority: number,
        private maxNeeded: number,
        private onlyBuildWhenFloatingCreditsAmount?: number,
    ) {}

    getPlacementLocation(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
    ): { rx: number; ry: number } | undefined {
        return getDefaultPlacementLocation(game, playerData, playerData.startLocation, technoRules);
    }

    getPriority(game: GameApi, playerData: PlayerData, technoRules: TechnoRules): number {
        const numOwned = numBuildingsOwnedOfType(game, playerData, technoRules);
        if (numOwned >= this.maxNeeded) {
            return -100;
        }

        if (this.onlyBuildWhenFloatingCreditsAmount && playerData.credits < this.onlyBuildWhenFloatingCreditsAmount) {
            return -100;
        }

        return this.basePriority * (1.0 - numOwned / this.maxNeeded);
    }
}
