import { BasicMission } from "./basicMission.js";
import { RetreatSquad } from "../behaviours/retreatSquad.js";
import { DebugLogger } from "../../common/utils.js";
import { Vector2 } from "@chronodivide/game-api";

export class RetreatMission extends BasicMission<RetreatSquad> {
    constructor(uniqueName: string, retreatToPoint: Vector2, unitIds: number[], logger: DebugLogger) {
        super(uniqueName, new RetreatSquad(unitIds, retreatToPoint), logger);
    }
}
