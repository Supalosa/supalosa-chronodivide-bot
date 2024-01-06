import { BasicMission } from "./basicMission.js";
import { RetreatSquad } from "../behaviours/retreatSquad.js";
import { DebugLogger } from "../../common/utils.js";
import { Vector2 } from "@chronodivide/game-api";

export class RetreatMission extends BasicMission<RetreatSquad> {
    constructor(uniqueName: string, priority: number, retreatToPoint: Vector2, unitIds: number[], logger: DebugLogger) {
        super(uniqueName, priority, new RetreatSquad(unitIds, retreatToPoint), logger);
    }
}
