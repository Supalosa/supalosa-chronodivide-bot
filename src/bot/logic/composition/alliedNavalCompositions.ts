import { GameApi, PlayerData } from "@chronodivide/game-api";
import { MatchAwareness } from "../awareness";
import { UnitComposition } from "./common";

export const getNavalCompositions = (
    gameApi: GameApi,
    playerData: PlayerData,
    matchAwareness: MatchAwareness,
): UnitComposition => {
    const hasNavalYard = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GAYARD").length > 0;
    const hasAirforce = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GAAIRC" || r.name === "AMRADR").length > 0;
    const hasBattleLab = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GATECH").length > 0;

    // 基础海军编队
    let composition: UnitComposition = {};
    
    // 驱逐舰作为基础单位
    if (hasNavalYard) {
        composition.DEST = 4; // 增加到4艘驱逐舰以提供足够的火力
    }

    // 神盾巡洋舰作为防空单位
    if (hasAirforce) {
        composition.AEGIS = 2; // 增加到2艘神盾巡洋舰提供更好的防空支援
    }

    // 航母和海豚作为高级单位
    if (hasBattleLab) {
        composition.CARRIER = 1; // 1艘航母
        composition.DLPH = 2; // 2只海豚应付巨型乌贼SQD
    }

    return composition;
}; 