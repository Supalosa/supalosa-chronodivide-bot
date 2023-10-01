import { Point2D } from "@chronodivide/game-api";
import { OneTimeMission } from "./oneTimeMission.js";
import { AttackSquad } from "../../squad/behaviours/attackSquad.js";

export type AttackTarget = Point2D | null;

export const GeneralAttack: AttackTarget = null;

/**
 * A mission that tries to attack a certain area.
 */
export class AttackMission extends OneTimeMission {
    constructor(uniqueName: string, priority: number, rallyArea: Point2D, attackArea: AttackTarget, radius: number) {
        super(uniqueName, priority, () => new AttackSquad(rallyArea, attackArea, radius));
    }
}
