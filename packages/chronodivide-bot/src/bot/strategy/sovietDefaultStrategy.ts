import { GameApi, PlayerData } from "@chronodivide/game-api";
import { Strategy } from "./strategy.js";
import { UnitComposition } from "../logic/composition/common.js";
import { MatchAwareness } from "../logic/awareness.js";

export class SovietDefaultStrategy implements Strategy {
    getAttackUnitComposition(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
    ): UnitComposition {
        const hasWarFactory = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "NAWEAP").length > 0;
        const hasRadar = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "NARADR").length > 0;
        const hasBattleLab = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "NATECH").length > 0;

        const includeInfantry = !hasBattleLab;
        return {
            ...(includeInfantry && { E2: 10 }),
            ...(hasWarFactory && { HTNK: 3, HTK: 2 }),
            ...(hasRadar && { V3: 1 }),
            ...(hasBattleLab && { APOC: 2 }),
        };
    }
}
