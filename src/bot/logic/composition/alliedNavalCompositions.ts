import { GameApi, PlayerData } from "@chronodivide/game-api";
import { MatchAwareness } from "../awareness";
import { UnitComposition } from "./common";

export const getNavalCompositions = (
    gameApi: GameApi,
    playerData: PlayerData,
    matchAwareness: MatchAwareness,
): UnitComposition => {
    console.log(`[NAVAL_DEBUG] 计算盟军海军编队组成 (玩家: ${playerData.name})`);
    
    const hasNavalYard = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GAYARD").length > 0;
    const hasAirforce = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GAAIRC" || r.name === "AMRADR").length > 0;
    const hasBattleLab = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GATECH").length > 0;

    console.log(`[NAVAL_DEBUG]   建筑状态: 船厂=${hasNavalYard}, 空军指挥部=${hasAirforce}, 战斗实验室=${hasBattleLab}`);

    // 基础海军编队
    let composition: UnitComposition = {};
    
    // 驱逐舰作为基础单位
    if (hasNavalYard) {
        composition.DEST = 3; // 驱逐舰
        console.log(`[NAVAL_DEBUG]   添加驱逐舰 x3`);
    }

    // 神盾巡洋舰作为防空单位
    if (hasAirforce) {
        composition.AEGIS = 1; // 神盾巡洋舰
        console.log(`[NAVAL_DEBUG]   添加神盾巡洋舰 x1`);
    }

    // 航母和海豚作为高级单位
    if (hasBattleLab) {
        composition.CARRIER = 1; // 1艘航母
        composition.DLPH = 2; // 2只海豚应付巨型乌贼SQD
        console.log(`[NAVAL_DEBUG]   添加航母 x1, 海豚 x2`);
    }

    console.log(`[NAVAL_DEBUG]   最终编队:`, composition);
    return composition;
}; 