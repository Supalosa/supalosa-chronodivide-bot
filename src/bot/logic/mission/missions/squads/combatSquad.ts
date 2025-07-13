import { ActionsApi, GameApi, GameMath, MovementZone, PlayerData, UnitData, Vector2 } from "@chronodivide/game-api";
import { MatchAwareness } from "../../../awareness.js";
import { getAttackWeight, manageAttackMicro, manageMoveMicro } from "./common.js";
import { DebugLogger, isOwnedByNeutral, maxBy, minBy } from "../../../common/utils.js";
import { ActionBatcher, BatchableAction } from "../../actionBatcher.js";
import { Squad } from "./squad.js";
import { Mission } from "../../mission.js";

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

    /**
     *
     * @param targetArea the area to move the combat squad
     */
    constructor(private targetArea: Vector2) {}

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
    ) {
        if (
            mission.getUnitIds().length > 0 &&
            (!this.lastCommand || gameApi.getCurrentTick() > this.lastCommand + TARGET_UPDATE_INTERVAL_TICKS)
        ) {
            this.lastCommand = gameApi.getCurrentTick();
            const centerOfMass = mission.getCenterOfMass();
            const maxDistance = mission.getMaxDistanceToCenterOfMass();
            const unitIds = mission.getUnitsMatchingByRule(gameApi, (r) => r.isSelectableCombatant);
            const units = unitIds
                .map((unitId) => gameApi.getUnitData(unitId))
                .filter((unit): unit is UnitData => !!unit);

            // Only use ground units for center of mass.
            const groundUnitIds = mission.getUnitsMatchingByRule(
                gameApi,
                (r) =>
                    r.isSelectableCombatant &&
                    (r.movementZone === MovementZone.Infantry ||
                        r.movementZone === MovementZone.Normal ||
                        r.movementZone === MovementZone.InfantryDestroyer),
            );

            if (this.state === SquadState.Gathering) {
                const requiredGatherRadius = GameMath.sqrt(groundUnitIds.length) * GATHER_RATIO + MIN_GATHER_RADIUS;
                if (
                    centerOfMass &&
                    maxDistance &&
                    gameApi.mapApi.getTile(centerOfMass.x, centerOfMass.y) !== undefined &&
                    maxDistance > requiredGatherRadius
                ) {
                    units.forEach((unit) => {
                        const moveAction = manageMoveMicro(unit, centerOfMass);
                        if (moveAction) {
                            actionBatcher.push(moveAction);
                        }
                    });
                } else {
                    logger(`CombatSquad ${mission.getUniqueName()} switching back to attack mode (${maxDistance})`);
                    this.state = SquadState.Attacking;
                }
            } else {
                const targetPoint = this.targetArea || playerData.startLocation;
                const requiredGatherRadius = GameMath.sqrt(groundUnitIds.length) * GATHER_RATIO + MAX_GATHER_RADIUS;
                if (
                    centerOfMass &&
                    maxDistance &&
                    gameApi.mapApi.getTile(centerOfMass.x, centerOfMass.y) !== undefined &&
                    maxDistance > requiredGatherRadius
                ) {
                    // Switch back to gather mode
                    logger(`CombatSquad ${mission.getUniqueName()} switching back to gather (${maxDistance})`);
                    this.state = SquadState.Gathering;
                    return;
                }
                // The unit with the shortest range chooses the target. Otherwise, a base range of 5 is chosen.
                const getRangeForUnit = (unit: UnitData) =>
                    unit.primaryWeapon?.maxRange ?? unit.secondaryWeapon?.maxRange ?? 5;
                const attackLeader = minBy(units, getRangeForUnit);
                if (!attackLeader) {
                    return;
                }
                // Find units within double the range of the leader.
                const nearbyHostiles = matchAwareness
                    .getHostilesNearPoint(attackLeader.tile.rx, attackLeader.tile.ry, ATTACK_SCAN_AREA)
                    .map(({ unitId }) => gameApi.getUnitData(unitId))
                    .filter((unit) => !isOwnedByNeutral(unit)) as UnitData[];

                for (const unit of units) {
                    const bestUnit = maxBy(nearbyHostiles, (target) => getAttackWeight(unit, target));
                    if (bestUnit) {
                        const attackAction = manageAttackMicro(unit, bestUnit);
                        if (attackAction) {
                            actionBatcher.push(attackAction);
                        }
                        this.debugLastTarget = `Unit ${bestUnit.id.toString()}`;
                    } else {
                        const moveAction = manageMoveMicro(unit, targetPoint);
                        if (moveAction) {
                            actionBatcher.push(moveAction);
                        }
                        this.debugLastTarget = `@${targetPoint.x},${targetPoint.y}`;
                    }
                }
            }
        }
    }
}
