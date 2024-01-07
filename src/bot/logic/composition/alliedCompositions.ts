import { GameApi, PlayerData } from "@chronodivide/game-api";
import { MatchAwareness } from "../awareness";
import { UnitComposition } from "./common";

export const getAlliedCompositions = (
    gameApi: GameApi,
    playerData: PlayerData,
    matchAwareness: MatchAwareness,
): UnitComposition => {
    const hasWarFactory = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GAWEAP").length > 0;
    const hasAirforce =
        gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GAAIRC" || r.name === "AMRADR").length > 0;
    const hasBattleLab = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GATECH").length > 0;

    const includeInfantry = !hasAirforce && !hasBattleLab;
    return {
        ...(includeInfantry && { E1: 5 }),
        ...(hasWarFactory && { MTNK: 3, FV: 2 }),
        ...(hasAirforce && { JUMPJET: 6 }),
        ...(hasBattleLab && { SREF: 2, MGTK: 3 }),
    };
};
