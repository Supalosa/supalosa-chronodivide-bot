import { GameApi, GameMath, MapApi, ObjectType, PlayerData, UnitData, Vector2 } from "@chronodivide/game-api";
import { CombatSquad } from "../../squad/behaviours/combatSquad.js";
import { Mission, MissionAction, disbandMission, noop } from "../mission.js";
import { Squad } from "../../squad/squad.js";
import { MissionFactory } from "../missionFactories.js";
import { MatchAwareness } from "../../awareness.js";
import { MissionController } from "../missionController.js";
import { RetreatMission } from "./retreatMission.js";
import { DebugLogger, maxBy } from "../../common/utils.js";

export enum AttackFailReason {
    NoTargets = 0,
    DefenceTooStrong = 1,
}

const NO_TARGET_RETARGET_TICKS = 450;
const NO_TARGET_IDLE_TIMEOUT_TICKS = 900;

/**
 * A mission that tries to attack a certain area.
 */
export class AttackMission extends Mission<AttackFailReason> {
    private lastTargetSeenAt = 0;
    private behaviour: CombatSquad | undefined;
    private hasPickedNewTarget: boolean = false;

    constructor(
        uniqueName: string,
        priority: number,
        private rallyArea: Vector2,
        private attackArea: Vector2,
        private radius: number,
        logger: DebugLogger,
    ) {
        super(uniqueName, priority, logger);
    }

    onAiUpdate(gameApi: GameApi, playerData: PlayerData, matchAwareness: MatchAwareness): MissionAction {
        if (this.getSquad() === null) {
            this.behaviour = new CombatSquad(this.rallyArea, this.attackArea, this.radius);
            return this.setSquad(new Squad(this.getUniqueName(), this.behaviour, this));
        } else {
            // Dispatch missions.
            if (!matchAwareness.shouldAttack()) {
                return disbandMission(AttackFailReason.DefenceTooStrong);
            }

            const foundTargets = matchAwareness.getHostilesNearPoint2d(this.attackArea, this.radius);

            if (foundTargets.length > 0) {
                this.lastTargetSeenAt = gameApi.getCurrentTick();
                this.hasPickedNewTarget = false;
            } else if (gameApi.getCurrentTick() > this.lastTargetSeenAt + NO_TARGET_IDLE_TIMEOUT_TICKS) {
                return disbandMission(AttackFailReason.NoTargets);
            } else if (
                !this.hasPickedNewTarget &&
                gameApi.getCurrentTick() > this.lastTargetSeenAt + NO_TARGET_RETARGET_TICKS
            ) {
                const newTarget = generateTarget(gameApi, playerData, matchAwareness);
                if (newTarget) {
                    this.behaviour?.setAttackArea(newTarget);
                    this.hasPickedNewTarget = true;
                }
            }
        }
        return noop();
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
            .getVisibleUnits(playerData.name, "hostile")
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
                .map(gameApi.getPlayerData)
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

export class AttackMissionFactory implements MissionFactory {
    constructor(private lastAttackAt: number = -VISIBLE_TARGET_ATTACK_COOLDOWN_TICKS) {}

    getName(): string {
        return "AttackMissionFactory";
    }

    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
        if (!matchAwareness.shouldAttack()) {
            return;
        }
        if (gameApi.getCurrentTick() < this.lastAttackAt + VISIBLE_TARGET_ATTACK_COOLDOWN_TICKS) {
            return;
        }

        const attackRadius = 15;

        const includeEnemyBases = gameApi.getCurrentTick() > this.lastAttackAt + BASE_ATTACK_COOLDOWN_TICKS;

        const attackArea = generateTarget(gameApi, playerData, matchAwareness, includeEnemyBases);

        if (!attackArea) {
            return;
        }

        // TODO: not using a fixed value here. But performance slows to a crawl when this is unique.
        const squadName = "globalAttack";

        const tryAttack = missionController.addMission(
            new AttackMission(
                squadName,
                100,
                matchAwareness.getMainRallyPoint(),
                attackArea,
                attackRadius,
                logger,
            ).then((reason, squad) => {
                missionController.addMission(
                    new RetreatMission(
                        "retreat-from-" + squadName + gameApi.getCurrentTick(),
                        100,
                        matchAwareness.getMainRallyPoint(),
                        squad?.getUnitIds() ?? [],
                        logger,
                    ),
                );
            }),
        );
        if (tryAttack) {
            this.lastAttackAt = gameApi.getCurrentTick();
        }
    }

    onMissionFailed(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        failedMission: Mission,
        failureReason: any,
        missionController: MissionController,
    ): void {}
}
