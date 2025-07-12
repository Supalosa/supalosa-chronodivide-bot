import { ActionsApi, GameApi, ObjectType, PlayerData, SideType, UnitData, Vector2, SpeedType } from "@chronodivide/game-api";
import { CombatSquad } from "./squads/combatSquad.js";
import { Mission, MissionAction, disbandMission, noop, requestUnits } from "../mission.js";
import { MissionFactory } from "../missionFactories.js";
import { MatchAwareness } from "../../awareness.js";
import { MissionController } from "../missionController.js";
import { RetreatMission } from "./retreatMission.js";
import { DebugLogger, countBy, isOwnedByNeutral, maxBy } from "../../common/utils.js";
import { ActionBatcher } from "../actionBatcher.js";
import { getSovietComposition } from "../../composition/sovietCompositions.js";
import { getAlliedCompositions } from "../../composition/alliedCompositions.js";
import { UnitComposition } from "../../composition/common.js";
import { manageMoveMicro } from "./squads/common.js";
import { isPointReachable } from "../../map/pathfinding.js";
import { getNavalCompositions as getSovietNavalCompositions } from "../../composition/sovietNavalCompositions.js";
import { getNavalCompositions as getAlliedNavalCompositions } from "../../composition/alliedNavalCompositions.js";

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

function calculateTargetComposition(
    gameApi: GameApi,
    playerData: PlayerData,
    matchAwareness: MatchAwareness,
    useNaval: boolean = false,
): UnitComposition {
    if (!playerData.country) {
        throw new Error(`player ${playerData.name} has no country`);
    }
    
    // 如果指定使用海军编队
    if (useNaval) {
        return playerData.country.side === SideType.Nod
            ? getSovietNavalCompositions(gameApi, playerData, matchAwareness)  // 苏联海军
            : getAlliedNavalCompositions(gameApi, playerData, matchAwareness);  // 盟军海军
    }
    
    // 默认使用陆地编队
    return playerData.country.side === SideType.Nod
        ? getSovietComposition(gameApi, playerData, matchAwareness)
        : getAlliedCompositions(gameApi, playerData, matchAwareness);
}

const ATTACK_MISSION_PRIORITY_RAMP = 1.01;
const ATTACK_MISSION_MAX_PRIORITY = 50;

/**
 * A mission that tries to attack a certain area.
 */
export class AttackMission extends Mission<AttackFailReason> {
    private squad: CombatSquad;
    private hasTriedLandAttack: boolean = false;
    private landAttackFailCount: number = 0;
    private readonly MAX_LAND_ATTACK_ATTEMPTS = 2;  // 最大陆地进攻尝试次数
    private isNavalMission: boolean = false;

    private lastTargetSeenAt = 0;
    private hasPickedNewTarget: boolean = false;

    private state: AttackMissionState = AttackMissionState.Preparing;

    constructor(
        uniqueName: string,
        private priority: number,
        private rallyArea: Vector2,
        private attackArea: Vector2,
        private radius: number,
        private composition: UnitComposition,
        logger: DebugLogger,
    ) {
        super(uniqueName, logger);
        this.squad = new CombatSquad(rallyArea, attackArea, radius);
    }

    private shouldSwitchToNaval(gameApi: GameApi): boolean {
        // Debug information for naval switch decision
        this.logger(
            `shouldSwitchToNaval? tick=${gameApi.getCurrentTick()} | isNavalMission=${this.isNavalMission} | landFails=${this.landAttackFailCount}/${this.MAX_LAND_ATTACK_ATTEMPTS}`,
        );
        this.logger(
            `    rallyArea=(${this.rallyArea.x},${this.rallyArea.y}) attackArea=(${this.attackArea.x},${this.attackArea.y})`,
        );

        // 如果已经是海军任务，不需要切换
        if (this.isNavalMission) {
            this.logger("    Already naval mission, skip switch check.");
            return false;
        }

        const reachable = isPointReachable(gameApi, this.rallyArea, this.attackArea, SpeedType.Track, 6);
        this.logger(`    pathReachable=${reachable}`);

        // 如果目标点对陆地单位不可达
        if (!reachable) {
            this.logger("目标点陆地单位无法到达，切换为海军编队");
            return true;
        }
        
        // 如果陆地进攻多次失败
        if (this.landAttackFailCount >= this.MAX_LAND_ATTACK_ATTEMPTS) {
            this.logger("陆地进攻失败次数过多，切换为海军编队");
            return true;
        }
        
        return false;
    }

    _onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction {
        switch (this.state) {
            case AttackMissionState.Preparing:
                return this.handlePreparingState(gameApi, actionsApi, playerData, matchAwareness, actionBatcher);
            case AttackMissionState.Attacking:
                return this.handleAttackingState(gameApi, actionsApi, playerData, matchAwareness, actionBatcher);
            case AttackMissionState.Retreating:
                return this.handleRetreatingState(gameApi, actionsApi, playerData, matchAwareness, actionBatcher);
        }
    }

    private handlePreparingState(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ) {
        // 检查是否需要切换到海军编队
        if (!this.isNavalMission && this.shouldSwitchToNaval(gameApi)) {
            this.isNavalMission = true;
            this.composition = calculateTargetComposition(gameApi, playerData, matchAwareness, true);
            this.logger("已切换为海军编队");
            this.logger(`[NAVAL_DEBUG] 海军编队组成: ${JSON.stringify(this.composition)}`);
            return noop();
        }

        const currentComposition: UnitComposition = countBy(this.getUnitsGameObjectData(gameApi), (unit) => unit.name);
        
        // 调试当前单位组成
        if (this.isNavalMission) {
            this.logger(`[NAVAL_DEBUG] 当前海军单位组成: ${JSON.stringify(currentComposition)}`);
            this.logger(`[NAVAL_DEBUG] 目标海军编队组成: ${JSON.stringify(this.composition)}`);
        }

        const missingUnits = Object.entries(this.composition).filter(([unitType, targetAmount]) => {
            return !currentComposition[unitType] || currentComposition[unitType] < targetAmount;
        });

        if (missingUnits.length > 0) {
            if (this.isNavalMission) {
                this.logger(`[NAVAL_DEBUG] 缺少海军单位: ${JSON.stringify(missingUnits)}`);
            }
            this.priority = Math.min(this.priority * ATTACK_MISSION_PRIORITY_RAMP, ATTACK_MISSION_MAX_PRIORITY);
            return requestUnits(
                missingUnits.map(([unitName]) => unitName),
                this.priority,
            );
        } else {
            if (this.isNavalMission) {
                this.logger(`[NAVAL_DEBUG] 海军编队准备完毕，开始攻击阶段`);
            }
            this.priority = ATTACK_MISSION_INITIAL_PRIORITY;
            this.state = AttackMissionState.Attacking;
            return noop();
        }
    }

    private handleAttackingState(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ) {
        if (this.getUnitIds().length === 0) {
            if (!this.isNavalMission) {
                this.landAttackFailCount++;
                if (this.shouldSwitchToNaval(gameApi)) {
                    this.state = AttackMissionState.Preparing;
                    return noop();
                }
            }
            this.state = AttackMissionState.Retreating;
            return noop();
        }

        const foundTargets = matchAwareness
            .getHostilesNearPoint2d(this.attackArea, this.radius)
            .map((unit) => gameApi.getUnitData(unit.unitId))
            .filter((unit) => !isOwnedByNeutral(unit)) as UnitData[];

        const update = this.squad.onAiUpdate(
            gameApi,
            actionsApi,
            actionBatcher,
            playerData,
            this,
            matchAwareness,
            this.logger,
        );

        if (update.type !== "noop") {
            return update;
        }

        if (foundTargets.length > 0) {
            this.lastTargetSeenAt = gameApi.getCurrentTick();
            this.hasPickedNewTarget = false;
        } else if (gameApi.getCurrentTick() > this.lastTargetSeenAt + NO_TARGET_IDLE_TIMEOUT_TICKS) {
            return disbandMission(AttackFailReason.NoTargets);
        } else if (
            !this.hasPickedNewTarget &&
            gameApi.getCurrentTick() > this.lastTargetSeenAt + NO_TARGET_RETARGET_TICKS
        ) {
            const newTarget = generateTarget(gameApi, playerData, matchAwareness, false, this.logger);
            if (newTarget) {
                this.squad.setAttackArea(newTarget);
                this.hasPickedNewTarget = true;
            }
        }

        return noop();
    }

    private handleRetreatingState(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ) {
        this.getUnits(gameApi).forEach((unitId) => {
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
    logger?: DebugLogger,
): Vector2 | null {
    const rallyPoint = matchAwareness.getMainRallyPoint();
    // Randomly decide between harvester and base.
    try {
        const tryFocusHarvester = gameApi.generateRandomInt(0, 1) === 0;
        const enemyUnits = gameApi
            .getVisibleUnits(playerData.name, "enemy")
            .map((unitId) => gameApi.getUnitData(unitId))
            .filter((u) => !!u && gameApi.getPlayerData(u.owner).isCombatant) as UnitData[];

        // Adjusted weight: penalise targets that ground units cannot reach (e.g. water targets).
        const computeWeight = (u: UnitData) => {
            let weight = getTargetWeight(u, tryFocusHarvester);
            try {
                // If rallyPoint -> target unreachable by Track, down-weight.
                if (!isPointReachable(gameApi, rallyPoint, new Vector2(u.tile.rx, u.tile.ry), SpeedType.Track, 6)) {
                    weight *= 0.3; // 70% penalty
                }
            } catch (err) {
                // Pathfinding error; treat as unreachable but avoid spamming logs.
                weight *= 0.3;
            }
            return weight;
        };

        const maxUnit = maxBy(enemyUnits, computeWeight);
        if (maxUnit) {
            logger?.(
                `generateTarget: picked visible enemy unit ${maxUnit.name} (id=${maxUnit.id}) at (${maxUnit.tile.rx},${maxUnit.tile.ry})`,
            );
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
                const targetLoc = unexploredEnemyLocations[idx].startLocation;
                logger?.(`generateTarget: picked unexplored enemy base at (${targetLoc.x},${targetLoc.y})`);
                return targetLoc;
            }
        }
    } catch (err) {
        logger?.(`generateTarget: ERROR while selecting target: ${err}`);
        // error; fallthrough to other logic
    }

    // Fallback 1: target visible enemy MCV (undeployed construction vehicle)
    try {
        const baseUnitNames: string[] = gameApi.getGeneralRules().baseUnit ?? [];
        const enemyMcvs = gameApi
            .getVisibleUnits(playerData.name, "enemy", (r) => !!r.deploysInto && baseUnitNames.includes(r.name));
        if (enemyMcvs.length > 0) {
            const mcvId = enemyMcvs[0];
            const mcvData = gameApi.getUnitData(mcvId);
            if (mcvData) {
                logger?.(
                    `generateTarget: fallback to enemy MCV ${mcvData.name} (id=${mcvData.id}) at (${mcvData.tile.rx},${mcvData.tile.ry})`,
                );
                return new Vector2(mcvData.tile.rx, mcvData.tile.ry);
            }
        }
    } catch (_) {
        // ignore
    }

    // No suitable target
    return null;
}

// Number of ticks between attacking visible targets.
const VISIBLE_TARGET_ATTACK_COOLDOWN_TICKS = 120;

// Number of ticks between attacking "bases" (enemy starting locations).
const BASE_ATTACK_COOLDOWN_TICKS = 1800;

const ATTACK_MISSION_INITIAL_PRIORITY = 1;

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
        if (gameApi.getCurrentTick() < this.lastAttackAt + VISIBLE_TARGET_ATTACK_COOLDOWN_TICKS) {
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

        const includeEnemyBases = gameApi.getCurrentTick() > this.lastAttackAt + BASE_ATTACK_COOLDOWN_TICKS;

        const attackArea = generateTarget(gameApi, playerData, matchAwareness, includeEnemyBases, logger);

        if (!attackArea) {
            return;
        }

        const squadName = "attack_" + gameApi.getCurrentTick();

        const composition: UnitComposition = calculateTargetComposition(gameApi, playerData, matchAwareness);

        const tryAttack = missionController.addMission(
            new AttackMission(
                squadName,
                ATTACK_MISSION_INITIAL_PRIORITY,
                matchAwareness.getMainRallyPoint(),
                attackArea,
                attackRadius,
                composition,
                logger,
            ).then((unitIds, reason) => {
                missionController.addMission(
                    new RetreatMission(
                        "retreat-from-" + squadName + gameApi.getCurrentTick(),
                        matchAwareness.getMainRallyPoint(),
                        unitIds,
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
        failedMission: Mission<any>,
        failureReason: any,
        missionController: MissionController,
    ): void {}
}
