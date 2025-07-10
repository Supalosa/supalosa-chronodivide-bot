import { ActionsApi, GameApi, OrderType, PlayerData, Vector2, SpeedType, LandType } from "@chronodivide/game-api";
import { MissionFactory } from "../missionFactories.js";
import { MatchAwareness } from "../../awareness.js";
import { Mission, MissionAction, disbandMission, noop, requestUnits } from "../mission.js";
import { MissionController } from "../missionController.js";
import { DebugLogger } from "../../common/utils.js";
import { ActionBatcher } from "../actionBatcher.js";
import { PrioritisedScoutTarget } from "../../common/scout.js";
import { determineMapBounds, getDistanceBetweenTileAndPoint } from "../../map/map.js";

const AMPHIBIOUS_SCOUT_MOVE_COOLDOWN_TICKS = 30;
const MAX_ATTEMPTS_PER_TARGET = 5;
const MAX_TICKS_PER_TARGET = 600;
const POSITION_CHECK_INTERVAL = 60;
const STUCK_THRESHOLD = 2;

// 获取地图上所有的可通行点（包括水域和陆地）
function getAllAmphibiousPoints(gameApi: GameApi, sectorSize: number = 8): Vector2[] {
    const amphibiousPoints: Vector2[] = [];
    const mapBounds = determineMapBounds(gameApi.mapApi);
    
    for (let x = 0; x < mapBounds.width; x += sectorSize) {
        for (let y = 0; y < mapBounds.height; y += sectorSize) {
            if (x >= 0 && x < mapBounds.width && y >= 0 && y < mapBounds.height) {
                const tile = gameApi.mapApi.getTile(x, y);
                if (tile && (tile.landType === LandType.Water || tile.landType === LandType.Clear || tile.landType === LandType.Beach || tile.landType === LandType.Tiberium)) {
                    // 确保这个点是可通行的
                    const path = gameApi.mapApi.findPath( 
                        SpeedType.Amphibious,
                        true,
                        { tile: tile, onBridge: false },
                        { tile: tile, onBridge: false }
                    );
                    if (path) {
                        amphibiousPoints.push(new Vector2(x, y));
                    }
                }
            }
        }
    }

    if (amphibiousPoints.length === 0 && sectorSize > 2) {
        return getAllAmphibiousPoints(gameApi, Math.floor(sectorSize / 2));
    }

    return amphibiousPoints;
}

/**
 * 两栖侦察任务，使用两栖单位进行地图侦察
 */
export class AmphibiousScoutingMission extends Mission {
    private scoutTarget: Vector2 | null = null;
    private attemptsOnCurrentTarget: number = 0;
    private scoutTargetRefreshedAt: number = 0;
    private lastMoveCommandTick: number = 0;
    private scoutTargetIsPermanent: boolean = false;
    private hadUnit: boolean = false;
    private amphibiousPoints: Vector2[] | null = null;
    private visitedPoints: Set<string> = new Set();
    private lastPosition: Vector2 | null = null;
    private lastPositionCheckTick: number = 0;
    private scoutMinDistance?: number;

    constructor(
        uniqueName: string,
        private priority: number,
        logger: DebugLogger,
    ) {
        super(uniqueName, logger);
    }

    private initializeAmphibiousPoints(gameApi: GameApi): void {
        if (this.amphibiousPoints === null) {
            this.amphibiousPoints = getAllAmphibiousPoints(gameApi);
            // 随机打乱探索点顺序
            for (let i = this.amphibiousPoints.length - 1; i > 0; i--) {
                const j = Math.floor(gameApi.generateRandomInt(0, i));
                [this.amphibiousPoints[i], this.amphibiousPoints[j]] = [this.amphibiousPoints[j], this.amphibiousPoints[i]];
            }
            this.logger(`找到 ${this.amphibiousPoints.length} 个两栖探索点`);
        }
    }

    private isUnitStuck(currentPosition: Vector2): boolean {
        if (!this.lastPosition) return false;
        const dx = Math.abs(currentPosition.x - this.lastPosition.x);
        const dy = Math.abs(currentPosition.y - this.lastPosition.y);
        return dx <= STUCK_THRESHOLD && dy <= STUCK_THRESHOLD;
    }

    private getNextAmphibiousTarget(gameApi: GameApi, currentPosition: Vector2, playerData: PlayerData): Vector2 | null {
        this.initializeAmphibiousPoints(gameApi);
        if (!this.amphibiousPoints || this.amphibiousPoints.length === 0) return null;

        // 找到最近的未访问点
        let bestPoint = null;
        let bestDistance = Infinity;

        for (const point of this.amphibiousPoints) {
            const pointKey = `${point.x},${point.y}`;
            if (this.visitedPoints.has(pointKey)) continue;

            const tile = gameApi.mapApi.getTile(point.x, point.y);
            if (!tile || gameApi.mapApi.isVisibleTile(tile, playerData.name)) {
                this.visitedPoints.add(pointKey);
                continue;
            }

            const distance = getDistanceBetweenTileAndPoint(tile, currentPosition);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestPoint = point;
            }
        }

        return bestPoint;
    }

    public _onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction {
        const scoutNames = ["SAPC", "LCRF"]; // 两栖单位
        const scouts = this.getUnitsOfTypes(gameApi, ...scoutNames);

        if ((matchAwareness.getSectorCache().getOverallVisibility() || 0) > 0.9) {
            return disbandMission();
        }

        if (scouts.length === 0) {
            if (this.scoutTarget && this.hadUnit) {
                this.attemptsOnCurrentTarget++;
                this.hadUnit = false;
            }
            return requestUnits(scoutNames, this.priority);
        }

        const currentScout = scouts[0];
        const currentPosition = new Vector2(currentScout.tile.rx, currentScout.tile.ry);

        // 检查单位是否停止移动
        if (gameApi.getCurrentTick() >= this.lastPositionCheckTick + POSITION_CHECK_INTERVAL) {
            if (this.lastPosition && this.isUnitStuck(currentPosition)) {
                this.logger(`单位在 ${currentPosition.x},${currentPosition.y} 停止移动，寻找新目标`);
                this.setScoutTarget(null, gameApi.getCurrentTick());
            }
            this.lastPosition = currentPosition;
            this.lastPositionCheckTick = gameApi.getCurrentTick();
        }

        if (this.scoutTarget) {
            this.hadUnit = true;

            if (!this.scoutTargetIsPermanent) {
                if (this.attemptsOnCurrentTarget > MAX_ATTEMPTS_PER_TARGET) {
                    this.logger(`侦察目标 ${this.scoutTarget.x},${this.scoutTarget.y} 尝试次数过多，切换下一个目标`);
                    this.setScoutTarget(null, 0);
                    return noop();
                }
                if (gameApi.getCurrentTick() > this.scoutTargetRefreshedAt + MAX_TICKS_PER_TARGET) {
                    this.logger(`侦察目标 ${this.scoutTarget.x},${this.scoutTarget.y} 耗时过长，切换下一个目标`);
                    this.setScoutTarget(null, 0);
                    return noop();
                }
            }

            const targetTile = gameApi.mapApi.getTile(this.scoutTarget.x, this.scoutTarget.y);
            if (!targetTile) {
                throw new Error(`目标位置 ${this.scoutTarget.x},${this.scoutTarget.y} 不存在`);
            }

            if (gameApi.getCurrentTick() > this.lastMoveCommandTick + AMPHIBIOUS_SCOUT_MOVE_COOLDOWN_TICKS) {
                this.lastMoveCommandTick = gameApi.getCurrentTick();
                scouts.forEach((unit) => {
                    if (this.scoutTarget) {
                        actionsApi.orderUnits([unit.id], OrderType.AttackMove, this.scoutTarget.x, this.scoutTarget.y);
                    }
                });

                // 检查单位是否在接近目标
                const distances = scouts.map((unit) => getDistanceBetweenTileAndPoint(unit.tile, this.scoutTarget!));
                const newMinDistance = Math.min(...distances);
                if (!this.scoutMinDistance || newMinDistance < this.scoutMinDistance) {
                    this.logger(`单位接近目标点 (${newMinDistance} < ${this.scoutMinDistance})`);
                    this.scoutTargetRefreshedAt = gameApi.getCurrentTick();
                    this.scoutMinDistance = newMinDistance;
                }
            }

            if (gameApi.mapApi.isVisibleTile(targetTile, playerData.name)) {
                const pointKey = `${this.scoutTarget.x},${this.scoutTarget.y}`;
                this.visitedPoints.add(pointKey);
                this.logger(`目标 ${this.scoutTarget.x},${this.scoutTarget.y} 侦察成功，切换下一个目标`);
                this.setScoutTarget(null, gameApi.getCurrentTick());
            }
        } else {
            // 获取新的侦察目标
            const nextScoutTarget = matchAwareness.getScoutingManager().getNewScoutTarget();
            if (nextScoutTarget) {
                this.setScoutTarget(nextScoutTarget.asVector2(), gameApi.getCurrentTick());
                return noop();
            }

            // 如果没有可用的侦察目标，选择就近的两栖点
            const nextAmphibiousTarget = this.getNextAmphibiousTarget(gameApi, currentPosition, playerData);
            if (nextAmphibiousTarget) {
                this.setScoutTarget(nextAmphibiousTarget, gameApi.getCurrentTick());
            } else {
                this.logger(`没有找到可达的两栖探索点，任务结束`);
                return disbandMission();
            }
        }
        return noop();
    }

    setScoutTarget(target: Vector2 | null, currentTick: number) {
        this.attemptsOnCurrentTarget = 0;
        this.scoutTargetRefreshedAt = currentTick;
        this.scoutTarget = target;
        this.scoutMinDistance = undefined;
        this.scoutTargetIsPermanent = false;
        this.lastPosition = null;
        this.lastPositionCheckTick = currentTick;
    }

    public getGlobalDebugText(): string | undefined {
        return "两栖侦察中";
    }

    public getPriority() {
        return this.priority;
    }
}

export class AmphibiousScoutingMissionFactory implements MissionFactory {
    constructor(private lastScoutAt: number = -300) {}

    getName(): string {
        return "AmphibiousScoutingMissionFactory";
    }

    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
        if (gameApi.getCurrentTick() < this.lastScoutAt + 300) {
            return;
        }
        if (!matchAwareness.getScoutingManager().hasScoutTargets()) {
            return;
        }
        if (!missionController.addMission(new AmphibiousScoutingMission("amphibiousScout", 10, logger))) {
            this.lastScoutAt = gameApi.getCurrentTick();
        }
    }

    onMissionFailed(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        failedMission: Mission<any>,
        failureReason: undefined,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
        if (gameApi.getCurrentTick() < this.lastScoutAt + 300) {
            return;
        }
        if (!matchAwareness.getScoutingManager().hasScoutTargets()) {
            return;
        }
        if (failedMission instanceof AmphibiousScoutingMission) {
            missionController.addMission(new AmphibiousScoutingMission("amphibiousScout", 10, logger));
            this.lastScoutAt = gameApi.getCurrentTick();
        }
    }
} 