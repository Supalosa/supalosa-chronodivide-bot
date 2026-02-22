import { GameApi, PlayerData } from "@chronodivide/game-api";
import { Strategy } from "./strategy.js";
import { UnitComposition } from "../logic/composition/common.js";
import { MatchAwareness } from "../logic/awareness.js";

export class AlliedDefaultStrategy implements Strategy {
    getAttackUnitComposition(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
    ): UnitComposition {
        const hasWarFactory = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GAWEAP").length > 0;
        const hasAirforce =
            gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GAAIRC" || r.name === "AMRADR").length >
            0;
        const hasBattleLab = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GATECH").length > 0;

        const includeInfantry = !hasAirforce && !hasBattleLab;
        return {
            ...(includeInfantry && { E1: 5 }),
            ...(hasWarFactory && { MTNK: 3, FV: 2 }),
            ...(hasAirforce && { JUMPJET: 6 }),
            ...(hasBattleLab && { SREF: 2, MGTK: 3 }),
        };
    }
}
