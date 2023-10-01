import { Point2D } from "@chronodivide/game-api";
import { DefenceSquad } from "../../squad/behaviours/defenceSquad.js";
import { ScoutingSquad } from "../../squad/behaviours/scoutingSquad.js";
import { OneTimeMission } from "./oneTimeMission.js";

/**
 * A mission that tries to defend a certain area.
 */
export class DefenceMission extends OneTimeMission {
    constructor(uniqueName: string, priority: number, area: Point2D, radius: number) {
        super(uniqueName, priority, () => new DefenceSquad(area, radius));
    }
}
