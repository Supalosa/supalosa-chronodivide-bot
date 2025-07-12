import { GameApi, PlayerData } from "@chronodivide/game-api";
import { MatchAwareness } from "../awareness";
import { UnitComposition } from "./common";

export const getNavalCompositions = (
    gameApi: GameApi,
    playerData: PlayerData,
    matchAwareness: MatchAwareness,
): UnitComposition => {
    console.log(`[NAVAL_DEBUG] 计算苏联海军编队组成 (玩家: ${playerData.name})`);
    
    const hasNavalYard = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "NAYARD").length > 0;
    const hasAirforce = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "NARADR").length > 0;
    const hasBattleLab = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "NATECH").length > 0;

    console.log(`[NAVAL_DEBUG]   建筑状态: 船厂=${hasNavalYard}, 雷达=${hasAirforce}, 战斗实验室=${hasBattleLab}`);

    // 基础海军编队
    let composition: UnitComposition = {};

    // 海蝎作为防空单位
    if (hasAirforce) {
        composition.HYD = 3;
        console.log(`[NAVAL_DEBUG]   添加海蝎 x3`);
    }

    // 无畏和乌贼作为高级单位
    if (hasBattleLab) {
        composition.DRED = 1;
        console.log(`[NAVAL_DEBUG]   添加无畏 x1`);
    }

    console.log(`[NAVAL_DEBUG]   最终编队:`, composition);
    return composition;
}; 