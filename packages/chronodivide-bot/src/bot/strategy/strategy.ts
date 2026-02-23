import { GameApi, PlayerData } from "@chronodivide/game-api";
import { UnitComposition } from "../logic/composition/common.js";
import { MatchAwareness } from "../logic/awareness.js";
import { Mission } from "../logic/mission/mission.js";
import { SupabotContext } from "../logic/common/context.js";
import { MissionController } from "../logic/mission/missionController.js";
import { DebugLogger } from "../logic/common/utils.js";

/**
 * Defines how the bot builds units, selects missions,
 * and makes high-level tactical decisions.
 */
export interface Strategy {
    /**
     * Poll the strategy for new missions to create in the current game state.
     * Strategy implementations should create or return missions as appropriate.
     *
     * @param context Current game context
     * @param missionController Controller to add missions to
     * @param logger Debug logger
     */
    maybeCreateMissions(context: SupabotContext, missionController: MissionController, logger: DebugLogger): void;

    /**
     * Handle a mission failure and potentially spawn follow-up or recovery missions.
     *
     * @param context Current game context
     * @param failedMission The mission that failed
     * @param failureReason The reason the mission failed
     * @param missionController Controller to add new missions to
     * @param logger Debug logger
     */
    onMissionFailed(
        context: SupabotContext,
        failedMission: Mission<any>,
        failureReason: any,
        missionController: MissionController,
        logger: DebugLogger,
    ): void;

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
