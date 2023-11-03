import { ActionsApi, GameApi, OrderType, PlayerData, Point2D } from "@chronodivide/game-api";
import { Squad } from "../squad.js";
import { SquadAction, SquadBehaviour, disband, noop, requestUnits } from "../squadBehaviour.js";
import { MatchAwareness } from "../../awareness.js";
import { DebugLogger } from "../../common/utils.js";
import { getDistanceBetweenPoints } from "../../map/map.js";

const SCOUT_MOVE_COOLDOWN_TICKS = 30;

// Max units to spend on a particular scout target.
const MAX_ATTEMPTS_PER_TARGET = 5;

// Maximum ticks to spend trying to scout a target *without making progress towards it*.
// Every time a unit gets closer to the target, the timer refreshes.
const MAX_TICKS_PER_TARGET = 600;

export class ScoutingSquad implements SquadBehaviour {
    private scoutTarget: Point2D | null = null;
    private attemptsOnCurrentTarget: number = 0;
    private scoutTargetRefreshedAt: number = 0;
    private lastMoveCommandTick: number = 0;

    // Minimum distance from a scout to the target.
    private scoutMinDistance?: number;

    private hadUnit: boolean = false;

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        squad: Squad,
        matchAwareness: MatchAwareness,
        logger: DebugLogger,
    ): SquadAction {
        const scoutNames = ["ADOG", "DOG", "E1", "E2", "FV", "HTK"];
        const scouts = squad.getUnitsOfTypes(gameApi, ...scoutNames);

        if ((matchAwareness.getSectorCache().getOverallVisibility() || 0) > 0.9) {
            return disband();
        }

        if (scouts.length === 0) {
            // Count the number of times the scout dies trying to uncover the current scoutTarget.
            if (this.scoutTarget && this.hadUnit) {
                this.attemptsOnCurrentTarget++;
                this.hadUnit = false;
            }
            return requestUnits(scoutNames, 100);
        } else if (this.scoutTarget) {
            this.hadUnit = true;
            if (this.attemptsOnCurrentTarget > MAX_ATTEMPTS_PER_TARGET) {
                logger(
                    `Scout target ${this.scoutTarget.x},${this.scoutTarget.y} took too many attempts, moving to next`,
                );
                this.setScoutTarget(null, 0);
                return noop();
            }
            if (gameApi.getCurrentTick() > this.scoutTargetRefreshedAt + MAX_TICKS_PER_TARGET) {
                logger(`Scout target ${this.scoutTarget.x},${this.scoutTarget.y} took too long, moving to next`);
                this.setScoutTarget(null, 0);
                return noop();
            }
            const targetTile = gameApi.mapApi.getTile(this.scoutTarget.x, this.scoutTarget.y);
            if (!targetTile) {
                throw new Error(`target tile ${this.scoutTarget.x},${this.scoutTarget.y} does not exist`);
            }
            if (gameApi.getCurrentTick() > this.lastMoveCommandTick + SCOUT_MOVE_COOLDOWN_TICKS) {
                this.lastMoveCommandTick = gameApi.getCurrentTick();
                scouts.forEach((unit) => {
                    if (this.scoutTarget) {
                        actionsApi.orderUnits([unit.id], OrderType.AttackMove, this.scoutTarget.x, this.scoutTarget.y);
                    }
                });
                // Check that a scout is actually moving closer to the target.
                const distances = scouts.map((unit) =>
                    getDistanceBetweenPoints({ x: unit.tile.rx, y: unit.tile.ry }, this.scoutTarget!),
                );
                const newMinDistance = Math.min(...distances);
                if (!this.scoutMinDistance || newMinDistance < this.scoutMinDistance) {
                    logger(
                        `Scout timeout refreshed because unit moved closer to point (${newMinDistance} < ${this.scoutMinDistance})`,
                    );
                    this.scoutTargetRefreshedAt = gameApi.getCurrentTick();
                    this.scoutMinDistance = newMinDistance;
                }
            }
            if (gameApi.mapApi.isVisibleTile(targetTile, playerData.name)) {
                logger(`Scout target ${this.scoutTarget.x},${this.scoutTarget.y} successfully scouted, moving to next`);
                this.setScoutTarget(null, gameApi.getCurrentTick());
            }
        } else {
            const candidatePoint = matchAwareness.getScoutingManager().getNewScoutTarget()?.asPoint2D();
            if (!candidatePoint) {
                logger(`No more scouting targets available, disbanding.`);
                return disband();
            }
            this.setScoutTarget(candidatePoint, gameApi.getCurrentTick());
        }
        return noop();
    }

    setScoutTarget(point: Point2D | null, currentTick: number) {
        this.attemptsOnCurrentTarget = 0;
        this.scoutTargetRefreshedAt = currentTick;
        this.scoutTarget = point;
        this.scoutMinDistance = undefined;
    }
}
