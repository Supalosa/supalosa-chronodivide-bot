import { GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { AiBuildingRules, getDefaultPlacementLocation, numBuildingsOwnedOfType } from "./buildingRules.js";
import { GlobalThreat } from "../threat/threat.js";

export class BasicBuilding implements AiBuildingRules {
    constructor(
        protected basePriority: number,
        protected maxNeeded: number,
        protected onlyBuildWhenFloatingCreditsAmount?: number,
    ) {}

    getPlacementLocation(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
    ): { rx: number; ry: number } | undefined {
        return getDefaultPlacementLocation(game, playerData, playerData.startLocation, technoRules);
    }

    getPriority(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | null,
    ): number {
        const numOwned = numBuildingsOwnedOfType(game, playerData, technoRules);
        const calcMaxCount = this.getMaxCount(game, playerData, technoRules, threatCache);
        if (numOwned >= (calcMaxCount ?? this.maxNeeded)) {
            return -100;
        }

        const priority = this.basePriority * (1.0 - numOwned / this.maxNeeded);

        if (this.onlyBuildWhenFloatingCreditsAmount && playerData.credits < this.onlyBuildWhenFloatingCreditsAmount) {
            return priority * (playerData.credits / this.onlyBuildWhenFloatingCreditsAmount);
        }

        return priority;
    }

    getMaxCount(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | null,
    ): number | null {
        return this.maxNeeded;
    }
}
