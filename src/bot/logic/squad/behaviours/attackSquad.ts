import _ from "lodash";
import { ActionsApi, GameApi, MovementZone, PlayerData, Point2D } from "@chronodivide/game-api";
import { Squad } from "../squad.js";
import { SquadAction, SquadBehaviour, grabCombatants, noop } from "../squadBehaviour.js";
import { MatchAwareness } from "../../awareness.js";
import { getDistanceBetweenPoints } from "../../map/map.js";
import { manageAttackMicro, manageMoveMicro } from "./common.js";

const TARGET_UPDATE_INTERVAL_TICKS = 10;
const GRAB_INTERVAL_TICKS = 10;

const GRAB_RADIUS = 30;

// Units must be in a certain radius of the center of mass before attacking.
// This scales for number of units in the squad though.
const MIN_GATHER_RADIUS = 5;
const GATHER_RATIO = 10;

enum AttackSquadState {
    Gathering,
    Attacking,
}

export class AttackSquad implements SquadBehaviour {
    private lastGrab: number | null = null;
    private lastCommand: number | null = null;
    private state = AttackSquadState.Gathering;

    constructor(
        private rallyArea: Point2D,
        private attackArea: Point2D,
        private radius: number,
    ) {}

    public setAttackArea(attackArea: Point2D) {
        this.attackArea = attackArea;
    }

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        squad: Squad,
        matchAwareness: MatchAwareness,
    ): SquadAction {
        if (!this.lastCommand || gameApi.getCurrentTick() > this.lastCommand + TARGET_UPDATE_INTERVAL_TICKS) {
            this.lastCommand = gameApi.getCurrentTick();
            const centerOfMass = squad.getCenterOfMass();
            const maxDistance = squad.getMaxDistanceToCenterOfMass();
            const units = squad.getUnitsMatching(gameApi, (r) => r.rules.isSelectableCombatant);

            if (this.state === AttackSquadState.Gathering) {
                // Only use ground units for center of mass.
                const groundUnits = squad.getUnitsMatching(
                    gameApi,
                    (r) =>
                        r.rules.isSelectableCombatant &&
                        (r.rules.movementZone === MovementZone.Infantry ||
                            r.rules.movementZone === MovementZone.Normal ||
                            r.rules.movementZone === MovementZone.InfantryDestroyer),
                );

                const requiredGatherRadius = Math.sqrt(groundUnits.length) * GATHER_RATIO + MIN_GATHER_RADIUS;
                if (
                    centerOfMass &&
                    maxDistance &&
                    gameApi.mapApi.getTile(centerOfMass.x, centerOfMass.y) !== undefined &&
                    maxDistance > requiredGatherRadius
                ) {
                    units.forEach((unit) => {
                        manageMoveMicro(actionsApi, unit, centerOfMass);
                    });
                } else {
                    this.state = AttackSquadState.Attacking;
                }
            } else {
                const attackPoint = this.attackArea || playerData.startLocation;

                for (const attacker of units) {
                    if (attacker.isIdle) {
                        const { rx: x, ry: y } = attacker.tile;
                        const range = attacker.primaryWeapon?.maxRange ?? attacker.secondaryWeapon?.maxRange ?? 5;
                        const nearbyHostiles = matchAwareness.getHostilesNearPoint(x, y, range * 2);
                        const closest = _.minBy(nearbyHostiles, ({ x: hX, y: hY }) =>
                            getDistanceBetweenPoints({ x, y }, { x: hX, y: hY }),
                        );
                        const closestUnit = closest ? gameApi.getUnitData(closest.unitId) ?? null : null;
                        if (closestUnit) {
                            manageAttackMicro(actionsApi, attacker, closestUnit);
                        } else {
                            manageMoveMicro(actionsApi, attacker, attackPoint);
                        }
                    }
                }
            }
        }

        if (!this.lastGrab || gameApi.getCurrentTick() > this.lastGrab + GRAB_INTERVAL_TICKS) {
            this.lastGrab = gameApi.getCurrentTick();
            return grabCombatants(this.rallyArea, this.radius * GRAB_RADIUS);
        } else {
            return noop();
        }
    }
}
