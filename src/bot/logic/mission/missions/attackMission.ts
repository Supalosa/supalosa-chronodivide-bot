import { GameApi, PlayerData, Point2D } from "@chronodivide/game-api";
import { OneTimeMission } from "./oneTimeMission.js";
import { AttackSquad } from "../../squad/behaviours/attackSquad.js";
import { Mission, MissionAction, disbandMission, noop } from "../mission.js";
import { GlobalThreat } from "../../threat/threat.js";
import { Squad } from "../../squad/squad.js";
import { getDistanceBetweenPoints, getDistanceBetweenUnits } from "../../map/map.js";

export type AttackTarget = Point2D | null;

export const GeneralAttack: AttackTarget = null;

export enum AttackFailReason {
    NoTargets = 0,
    DefenceTooStrong = 1,
}

const NO_TARGET_IDLE_TIMEOUT_TICKS = 60;

/**
 * A mission that tries to attack a certain area.
 */
export class AttackMission extends Mission {

    private lastTargetSeenAt = 0;


    constructor(uniqueName: string, priority: number, private rallyArea: Point2D, private attackArea: AttackTarget, private radius: number) {
        super(uniqueName, priority);
    }
    
    private isHostileUnit(game: GameApi, unitId: number, playerData: PlayerData) {
        const unitData = game.getUnitData(unitId);
        if (!unitData) {
            return false;
        }

        return unitData.owner != playerData.name && game.getPlayerData(unitData.owner)?.isCombatant;
    }

    onAiUpdate(gameApi: GameApi, playerData: PlayerData, threatData: GlobalThreat | null): MissionAction {
        if (this.getSquad() === null) {
            return this.setSquad(new Squad(this.getUniqueName(), new AttackSquad(this.rallyArea, this.attackArea, this.radius), this));
        } else {
            const foundTarget = gameApi
                        .getVisibleUnits(playerData.name, "hostile")
                        .some((unit) => this.isHostileUnit(gameApi, unit, playerData));
            if (foundTarget) {
                this.lastTargetSeenAt = gameApi.getCurrentTick();
            } else if (gameApi.getCurrentTick() > this.lastTargetSeenAt + NO_TARGET_IDLE_TIMEOUT_TICKS) {
                console.log(`Mission - Can't see any targets, disbanding attack.`);
                return disbandMission(AttackFailReason.NoTargets);
            }
        }
        return noop();
    }

}
