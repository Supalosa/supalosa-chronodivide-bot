import {
    ActionsApi,
    BotContext,
    GameApi,
    ObjectType,
    PlayerData,
    SideType,
    UnitData,
    Vector2,
} from "@chronodivide/game-api";
import { CombatSquad } from "./squads/combatSquad.js";
import { Mission, MissionAction, disbandMission, noop, requestUnits } from "../mission.js";
import { MatchAwareness } from "../../awareness.js";
import { MissionController } from "../missionController.js";
import { RetreatMission } from "./retreatMission.js";
import { DebugLogger, countBy, isOwnedByNeutral, maxBy } from "../../common/utils.js";
import { ActionBatcher } from "../actionBatcher.js";
import { UnitComposition } from "../../composition/common.js";
import { manageMoveMicro } from "./squads/common.js";
import { MissionContext, SupabotContext } from "../../common/context.js";

export enum AttackFailReason {
    NoTargets = 0,
    DefenceTooStrong = 1,
}

enum AttackMissionState {
    Preparing = 0,
    Attacking = 1,
    Retreating = 2,
}

const NO_TARGET_RETARGET_TICKS = 450;
const NO_TARGET_IDLE_TIMEOUT_TICKS = 900;

const ATTACK_MISSION_PRIORITY_RAMP = 1.01;
const ATTACK_MISSION_MAX_PRIORITY = 50;

/**
 * A mission that tries to attack a certain area.
 */
export class AttackMission extends Mission<AttackFailReason> {
    private squad: CombatSquad;

    private lastTargetSeenAt = 0;
    private hasPickedNewTarget: boolean = false;

    private state: AttackMissionState = AttackMissionState.Preparing;

    constructor(
        uniqueName: string,
        private priority: number,
        rallyArea: Vector2,
        private attackArea: Vector2,
        private radius: number,
        private composition: UnitComposition,
        logger: DebugLogger,
    ) {
        super(uniqueName, logger);
        this.squad = new CombatSquad(rallyArea, attackArea, radius);
    }

    _onAiUpdate(context: MissionContext): MissionAction {
        switch (this.state) {
            case AttackMissionState.Preparing:
                return this.handlePreparingState(context);
            case AttackMissionState.Attacking:
                return this.handleAttackingState(context);
            case AttackMissionState.Retreating:
                return this.handleRetreatingState(context);
        }
    }

    private handlePreparingState(context: MissionContext) {
        const { game } = context;
        const missingUnits = this.getMissingUnits(game, this.composition);
        if (missingUnits.length > 0) {
            this.priority = Math.min(this.priority * ATTACK_MISSION_PRIORITY_RAMP, ATTACK_MISSION_MAX_PRIORITY);
            return requestUnits(
                missingUnits.map(([unitName]) => unitName),
                this.priority,
            );
        } else {
            this.priority = ATTACK_MISSION_INITIAL_PRIORITY;
            this.state = AttackMissionState.Attacking;
            return noop();
        }
    }

    private handleAttackingState(context: MissionContext) {
        const { game, matchAwareness, actionBatcher } = context;
        const playerData = game.getPlayerData(context.player.name);
        if (this.getUnitIds().length === 0) {
            // TODO: disband directly (we no longer retreat when losing)
            this.state = AttackMissionState.Retreating;
            return noop();
        }

        const foundTargets = matchAwareness
            .getHostilesNearPoint2d(this.attackArea, this.radius)
            .map((unit) => game.getUnitData(unit.unitId))
            .filter((unit) => !isOwnedByNeutral(unit)) as UnitData[];

        const update = this.squad.onAiUpdate(context, this, this.logger);

        if (update.type !== "noop") {
            return update;
        }

        if (foundTargets.length > 0) {
            this.lastTargetSeenAt = game.getCurrentTick();
            this.hasPickedNewTarget = false;
        } else if (game.getCurrentTick() > this.lastTargetSeenAt + NO_TARGET_IDLE_TIMEOUT_TICKS) {
            return disbandMission(AttackFailReason.NoTargets);
        } else if (
            !this.hasPickedNewTarget &&
            game.getCurrentTick() > this.lastTargetSeenAt + NO_TARGET_RETARGET_TICKS
        ) {
            const newTarget = generateTarget(game, playerData, matchAwareness);
            if (newTarget) {
                this.squad.setAttackArea(newTarget);
                this.hasPickedNewTarget = true;
            }
        }

        return noop();
    }

    private handleRetreatingState(context: MissionContext) {
        const { game, actionBatcher, matchAwareness } = context;
        this.getUnits(game).forEach((unitId) => {
            actionBatcher.push(manageMoveMicro(unitId, matchAwareness.getMainRallyPoint()));
        });
        return disbandMission();
    }

    public getGlobalDebugText(): string | undefined {
        return this.squad.getGlobalDebugText() ?? "<none>";
    }

    public getState() {
        return this.state;
    }

    // This mission can give up its units while preparing.
    public isUnitsLocked(): boolean {
        return this.state !== AttackMissionState.Preparing;
    }

    public getPriority() {
        return this.priority;
    }
}

// Calculates the weight for initiating an attack on the position of a unit or building.
// This is separate from unit micro; the squad will be ordered to attack in the vicinity of the point.
const getTargetWeight: (unitData: UnitData, tryFocusHarvester: boolean) => number = (unitData, tryFocusHarvester) => {
    if (tryFocusHarvester && unitData.rules.harvester) {
        return 100000;
    } else if (unitData.type === ObjectType.Building) {
        return unitData.maxHitPoints * 10;
    } else {
        return unitData.maxHitPoints;
    }
};

function generateTarget(
    gameApi: GameApi,
    playerData: PlayerData,
    matchAwareness: MatchAwareness,
    includeBaseLocations: boolean = false,
): Vector2 | null {
    // Randomly decide between harvester and base.
    try {
        const tryFocusHarvester = gameApi.generateRandomInt(0, 1) === 0;
        const enemyUnits = gameApi
            .getVisibleUnits(playerData.name, "enemy")
            .map((unitId) => gameApi.getUnitData(unitId))
            .filter((u) => !!u && gameApi.getPlayerData(u.owner).isCombatant) as UnitData[];

        const maxUnit = maxBy(enemyUnits, (u) => getTargetWeight(u, tryFocusHarvester));
        if (maxUnit) {
            return new Vector2(maxUnit.tile.rx, maxUnit.tile.ry);
        }
        if (includeBaseLocations) {
            const mapApi = gameApi.mapApi;
            const enemyPlayers = gameApi
                .getPlayers()
                .map((p) => gameApi.getPlayerData(p))
                .filter((otherPlayer) => !gameApi.areAlliedPlayers(playerData.name, otherPlayer.name));

            const unexploredEnemyLocations = enemyPlayers.filter((otherPlayer) => {
                const tile = mapApi.getTile(otherPlayer.startLocation.x, otherPlayer.startLocation.y);
                if (!tile) {
                    return false;
                }
                return !mapApi.isVisibleTile(tile, playerData.name);
            });
            if (unexploredEnemyLocations.length > 0) {
                const idx = gameApi.generateRandomInt(0, unexploredEnemyLocations.length - 1);
                return unexploredEnemyLocations[idx].startLocation;
            }
        }
    } catch (err) {
        // There's a crash here when accessing a building that got destroyed. Will catch and ignore or now.
        return null;
    }
    return null;
}

// Number of ticks between attacking visible targets.
const VISIBLE_TARGET_ATTACK_COOLDOWN_TICKS = 120;

// Number of ticks between attacking "bases" (enemy starting locations).
const BASE_ATTACK_COOLDOWN_TICKS = 1800;

const ATTACK_MISSION_INITIAL_PRIORITY = 1;

export class AttackMissionFactory {
    constructor(private lastAttackAt: number = -VISIBLE_TARGET_ATTACK_COOLDOWN_TICKS) {}

    getName(): string {
        return "AttackMissionFactory";
    }

    maybeCreateMissions(
        context: SupabotContext,
        missionController: MissionController,
        logger: DebugLogger,
        composition: UnitComposition,
    ): void {
        const { game, matchAwareness } = context;
        const playerData = game.getPlayerData(context.player.name);
        if (game.getCurrentTick() < this.lastAttackAt + VISIBLE_TARGET_ATTACK_COOLDOWN_TICKS) {
            return;
        }

        // can only have one attack 'preparing' at once.
        if (
            missionController
                .getMissions()
                .some(
                    (mission): mission is AttackMission =>
                        mission instanceof AttackMission && mission.getState() === AttackMissionState.Preparing,
                )
        ) {
            return;
        }

        const attackRadius = 10;

        const includeEnemyBases = game.getCurrentTick() > this.lastAttackAt + BASE_ATTACK_COOLDOWN_TICKS;

        const attackArea = generateTarget(game, playerData, matchAwareness, includeEnemyBases);

        if (!attackArea) {
            return;
        }

        const squadName = "attack_" + game.getCurrentTick();

        const tryAttack = missionController.addMission(
            new AttackMission(
                squadName,
                ATTACK_MISSION_INITIAL_PRIORITY,
                matchAwareness.getMainRallyPoint(),
                attackArea,
                attackRadius,
                composition,
                logger,
            ).withOnFinish((unitIds, reason) => {
                missionController.addMission(
                    new RetreatMission(
                        "retreat-from-" + squadName + game.getCurrentTick(),
                        matchAwareness.getMainRallyPoint(),
                        unitIds,
                        logger,
                    ),
                );
            }),
        );
        if (tryAttack) {
            this.lastAttackAt = game.getCurrentTick();
        }
    }
}
