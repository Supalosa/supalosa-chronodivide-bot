import { GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { AiBuildingRules, getDefaultPlacementLocation, numBuildingsOwnedOfType } from "./buildingRules.js";

export class BasicNavalUnit implements AiBuildingRules {
    constructor(
        private basePriority: number,
        private baseAmount: number,
        private antiGroundPower: number = 1,
        private antiAirPower: number = 0,
        private antiNavalPower: number = 1,
    ) {}

    getPlacementLocation(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
    ): { rx: number; ry: number } | undefined {
        return undefined;  // Naval units don't need placement position
    }

    getPriority(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | null,
    ): number {
        // Units are not automatically built, but built by mission requests
        return 0;
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