import { GameApi, PlayerData } from "@chronodivide/game-api";
import { MatchAwareness } from "../awareness";
import { UnitComposition } from "./common";

export const getNavalCompositions = (
    gameApi: GameApi,
    playerData: PlayerData,
    matchAwareness: MatchAwareness,
): UnitComposition => {
    
    const hasNavalYard = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "NAYARD").length > 0;
    const hasAirforce = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "NARADR").length > 0;
    const hasBattleLab = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "NATECH").length > 0;

    // Basic naval formation
    let composition: UnitComposition = {};

    // Sea Scorpion as basic anti-air unit
    if (hasNavalYard) {
        composition.HYD = 2; // Sea Scorpion for anti-air defense
    }

    // Submarine as basic anti-ship unit
    if (hasNavalYard) {
        composition.SUB = 3; // Submarine for anti-ship combat
    }

    // Dreadnought as advanced unit
    if (hasBattleLab) {
        composition.DRED = 1; // Dreadnought as main battle ship
    }

    return composition;
}; 