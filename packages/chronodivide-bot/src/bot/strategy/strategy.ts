import { GameApi, PlayerData } from "@chronodivide/game-api";
import { UnitComposition } from "../logic/composition/common.js";
import { MatchAwareness } from "../logic/awareness.js";

/**
 * Defines how the bot builds units, selects missions,
 * and makes high-level tactical decisions.
 */
export interface Strategy {
    /**
     * Get the desired unit composition for the current game state.
     *
     * This is called when forming attack missions to determine what units
     * should be built and sent into combat.
     *
     * @param gameApi - API to query game state
     * @param playerData - Current player's data
     * @param matchAwareness - Cached map/threat awareness
     * @returns UnitComposition mapping unit types to desired quantities
     */
    getAttackUnitComposition(gameApi: GameApi, playerData: PlayerData, matchAwareness: MatchAwareness): UnitComposition;
}
