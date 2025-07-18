import {
    ActionsApi,
    AttackState,
    GameApi,
    GameMath,
    MovementZone,
    PlayerData,
    UnitData,
    Vector2,
} from "@chronodivide/game-api";
import { MatchAwareness } from "../../../awareness.js";
import { getAttackWeight, manageAttackMicro, manageMoveMicro } from "./common.js";
import { DebugLogger, isOwnedByNeutral, maxBy, minBy } from "../../../common/utils.js";
import { ActionBatcher, BatchableAction } from "../../actionBatcher.js";
import { Squad } from "./squad.js";
import { Mission, MissionAction, grabCombatants, noop } from "../../mission.js";

const TARGET_UPDATE_INTERVAL_TICKS = 10;

// Units must be in a certain radius of the center of mass before attacking.
// This scales for number of units in the squad though.
const MIN_GATHER_RADIUS = 5;

// If the radius expands beyond this amount then we should switch back to gathering mode.
const MAX_GATHER_RADIUS = 15;

const GATHER_RATIO = 10;

const ATTACK_SCAN_AREA = 15;

enum SquadState {
    Gathering,
    Attacking,
}

export class CombatSquad implements Squad {
    private lastCommand: number | null = null;
    private state = SquadState.Gathering;

    private debugLastTarget: string | undefined;

    private lastOrderGiven: { [unitId: number]: BatchableAction } = {};

    /**
     *
     * @param rallyArea the initial location to grab combatants
     * @param targetArea
     * @param radius
     */
    constructor(
        private rallyArea: Vector2,
        private targetArea: Vector2,
        private radius: number,
    ) {}

    public getGlobalDebugText(): string | undefined {
        return this.debugLastTarget ?? "<none>";
    }

    public setAttackArea(targetArea: Vector2) {
        this.targetArea = targetArea;
    }

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        actionBatcher: ActionBatcher,
        playerData: PlayerData,
        mission: Mission<any>,
        matchAwareness: MatchAwareness,
        logger: DebugLogger,
    ): MissionAction {
        if (
            mission.getUnitIds().length > 0 &&
            (!this.lastCommand || gameApi.getCurrentTick() > this.lastCommand + TARGET_UPDATE_INTERVAL_TICKS)
        ) {
            this.lastCommand = gameApi.getCurrentTick();
            const centerOfMass = mission.getCenterOfMass();
            const maxDistance = mission.getMaxDistanceToCenterOfMass();
            const units = mission.getUnitsMatching(gameApi, (r) => r.rules.isSelectableCombatant);

            // Only use ground units for center of mass.
            const groundUnits = mission.getUnitsMatching(
                gameApi,
                (r) =>
                    r.rules.isSelectableCombatant &&
                    (r.rules.movementZone === MovementZone.Infantry ||
                        r.rules.movementZone === MovementZone.Normal ||
                        r.rules.movementZone === MovementZone.InfantryDestroyer),
            );

            if (this.state === SquadState.Gathering) {
                const requiredGatherRadius = GameMath.sqrt(groundUnits.length) * GATHER_RATIO + MIN_GATHER_RADIUS;
                if (
                    centerOfMass &&
                    maxDistance &&
                    gameApi.mapApi.getTile(centerOfMass.x, centerOfMass.y) !== undefined &&
                    maxDistance > requiredGatherRadius
                ) {
                    units.forEach((unit) => {
                        this.submitActionIfNew(actionBatcher, manageMoveMicro(unit, centerOfMass));
                    });
                } else {
                    logger(`CombatSquad ${mission.getUniqueName()} switching back to attack mode (${maxDistance})`);
                    this.state = SquadState.Attacking;
                }
            } else {
                const targetPoint = this.targetArea || playerData.startLocation;
                const requiredGatherRadius = GameMath.sqrt(groundUnits.length) * GATHER_RATIO + MAX_GATHER_RADIUS;
                if (
                    centerOfMass &&
                    maxDistance &&
                    gameApi.mapApi.getTile(centerOfMass.x, centerOfMass.y) !== undefined &&
                    maxDistance > requiredGatherRadius
                ) {
                    // Switch back to gather mode
                    logger(`CombatSquad ${mission.getUniqueName()} switching back to gather (${maxDistance})`);
                    this.state = SquadState.Gathering;
                    return noop();
                }
                // The unit with the shortest range chooses the target. Otherwise, a base range of 5 is chosen.
                const getRangeForUnit = (unit: UnitData) =>
                    unit.primaryWeapon?.maxRange ?? unit.secondaryWeapon?.maxRange ?? 5;
                const attackLeader = minBy(units, getRangeForUnit);
                if (!attackLeader) {
                    return noop();
                }
                // Find units within double the range of the leader.
                const nearbyHostiles = matchAwareness
                    .getHostilesNearPoint(attackLeader.tile.rx, attackLeader.tile.ry, ATTACK_SCAN_AREA)
                    .map(({ unitId }) => gameApi.getUnitData(unitId))
                    .filter((unit) => !isOwnedByNeutral(unit)) as UnitData[];

                for (const unit of units) {
                    const bestUnit = maxBy(nearbyHostiles, (target) => getAttackWeight(unit, target));
                    if (bestUnit) {
                        this.submitActionIfNew(actionBatcher, manageAttackMicro(unit, bestUnit));
                        this.debugLastTarget = `Unit ${bestUnit.id.toString()}`;
                    } else {
                        this.submitActionIfNew(actionBatcher, manageMoveMicro(unit, targetPoint));
                        this.debugLastTarget = `@${targetPoint.x},${targetPoint.y}`;
                    }
                }
            }
        }
        return noop();
    }

    /**
     * Sends an action to the acitonBatcher if and only if the action is different from the last action we submitted to it.
     * Prevents spamming redundant orders, which affects performance and can also ccause the unit to sit around doing nothing.
     */
    private submitActionIfNew(actionBatcher: ActionBatcher, action: BatchableAction) {
        const lastAction = this.lastOrderGiven[action.unitId];
        if (!lastAction || !lastAction.isSameAs(action)) {
            actionBatcher.push(action);
            this.lastOrderGiven[action.unitId] = action;
        }
    }
}
