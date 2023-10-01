import { ScoutingSquad } from "../../squad/behaviours/scoutingSquad.js";
import { OneTimeMission } from "./oneTimeMission.js";

/**
 * A mission that tries to scout around the map with a cheap, fast unit (usually attack dogs)
 */
export class ScoutingMission extends OneTimeMission {
    constructor(uniqueName: string, priority: number) {
        super(uniqueName, priority, () => new ScoutingSquad());
    }
}
