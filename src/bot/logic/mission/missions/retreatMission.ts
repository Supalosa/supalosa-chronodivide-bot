import { Point2D } from "@chronodivide/game-api";
import { OneTimeMission } from "./oneTimeMission.js";
import { RetreatSquad } from "../../squad/behaviours/retreatSquad.js";

export class RetreatMission extends OneTimeMission {
    constructor(uniqueName: string, priority: number, retreatToPoint: Point2D, unitIds: number[]) {
        super(uniqueName, priority, () => new RetreatSquad(unitIds, retreatToPoint));
    }
}
