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

    // 基础海军编队
    let composition: UnitComposition = {};

    // 海蝎作为防空单位
    if (hasAirforce) {
        composition.HYD = 3;
    }

    // 无畏和乌贼作为高级单位
    if (hasBattleLab) {
        composition.DRED = 1;
    }

    return composition;
}; 