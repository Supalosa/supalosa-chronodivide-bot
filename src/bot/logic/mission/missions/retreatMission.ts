import { OneTimeMission } from "./oneTimeMission.js";
import { RetreatSquad } from "../../squad/behaviours/retreatSquad.js";
import { DebugLogger } from "../../common/utils.js";
import { Vector2 } from "@chronodivide/game-api";

export class RetreatMission extends OneTimeMission {
    constructor(uniqueName: string, priority: number, retreatToPoint: Vector2, unitIds: number[], logger: DebugLogger) {
        super(uniqueName, priority, () => new RetreatSquad(unitIds, retreatToPoint), logger);
    }
}
