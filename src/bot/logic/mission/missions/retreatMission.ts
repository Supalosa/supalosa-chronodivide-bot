import { Point2D } from "@chronodivide/game-api";
import { OneTimeMission } from "./oneTimeMission.js";
import { RetreatSquad } from "../../squad/behaviours/retreatSquad.js";
import { DebugLogger } from "../../common/utils.js";

export class RetreatMission extends OneTimeMission {
    constructor(uniqueName: string, priority: number, retreatToPoint: Point2D, unitIds: number[], logger: DebugLogger) {
        super(uniqueName, priority, () => new RetreatSquad(unitIds, retreatToPoint), logger);
    }
}
