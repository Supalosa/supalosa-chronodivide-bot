import { SectorCache } from "./map/sector";
import { GlobalThreat } from "./threat/threat";

export type GameKnowledge = {
    threatCache: GlobalThreat;
    sectorCache: SectorCache;
};
