import { GameApi, PlayerData, Point2D } from "@chronodivide/game-api";
import { SectorCache } from "./map/sector";
import { GlobalThreat } from "./threat/threat";

export type UnitPositionQuery = { x: number; y: number; unitId: number };

/**
 * The bot's understanding of the current state of the game.
 */
export interface MatchAwareness {
    /**
     * Returns the threat cache for the AI.
     */
    getThreatCache(): GlobalThreat | null;

    /**
     * Returns the sector visibility cache.
     */
    getSectorCache(): SectorCache;

    /**
     * Returns the enemy unit IDs in a certain radius of a point
     */
    getHostilesNearPoint2d(point: Point2D, radius: number): UnitPositionQuery[];

    getHostilesNearPoint(x: number, y: number, radius: number): UnitPositionQuery[];

    /**
     * Returns the main rally point for the AI, which updates every few ticks.
     */
    getMainRallyPoint(): Point2D;

    onGameStart(gameApi: GameApi, playerData: PlayerData): void;

    /**
     * Update the internal state of the Ai.
     * @param gameApi
     * @param playerData
     */
    onAiUpdate(gameApi: GameApi, playerData: PlayerData): void;

    /**
     * True if the AI should initiate an attack.
     */
    shouldAttack(): boolean;
}