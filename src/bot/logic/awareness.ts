import { Point2D } from "@chronodivide/game-api";
import { SectorCache } from "./map/sector";
import { GlobalThreat } from "./threat/threat";

/**
 * The bot's understanding of the current state of the game.
 */
export type MatchAwareness = {
    threatCache: GlobalThreat | null;
    sectorCache: SectorCache;

    mainRallyPoint: Point2D;
};
