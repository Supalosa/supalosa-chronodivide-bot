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

    // Sea Scorpion as anti-air unit
    if (hasAirforce) {
        composition.HYD = 3;
    }

    // Dreadnought and squid as advanced units
    if (hasBattleLab) {
        composition.DRED = 1;
    }

    return composition;
}; 