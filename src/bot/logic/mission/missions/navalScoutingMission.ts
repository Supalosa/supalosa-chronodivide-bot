import { ActionsApi, GameApi, OrderType, PlayerData, Vector2, SpeedType, LandType } from "@chronodivide/game-api";
import { MissionFactory } from "../missionFactories.js";
import { MatchAwareness } from "../../awareness.js";
import { Mission, MissionAction, disbandMission, noop, requestUnits } from "../mission.js";
import { MissionController } from "../missionController.js";
import { DebugLogger } from "../../common/utils.js";
import { ActionBatcher } from "../actionBatcher.js";
import { PrioritisedScoutTarget } from "../../common/scout.js";
import { determineMapBounds } from "../../map/map.js";

const NAVAL_SCOUT_MOVE_COOLDOWN_TICKS = 30;
const MAX_ATTEMPTS_PER_TARGET = 5;
const MAX_TICKS_PER_TARGET = 600;
const POSITION_CHECK_INTERVAL = 60; // 检查单位是否停止移动的间隔
const STUCK_THRESHOLD = 2; // 判定为停止移动的阈值（2x2区域）

// 获取地图上所有的水域点
function getAllWaterPoints(gameApi: GameApi, sectorSize: number = 8): Vector2[] {
    const waterPoints: Vector2[] = [];
    const mapBounds = determineMapBounds(gameApi.mapApi);
    
    // 确保不会超出地图边界
    for (let x = 0; x < mapBounds.width; x += sectorSize) {
        for (let y = 0; y < mapBounds.height; y += sectorSize) {
            // 检查当前点是否在地图范围内
            if (x >= 0 && x < mapBounds.width && y >= 0 && y < mapBounds.height) {
                const tile = gameApi.mapApi.getTile(x, y);
                if (tile && tile.landType === LandType.Water) {
                    // 确保这个水域点是可通行的
                    const path = gameApi.mapApi.findPath(
                        SpeedType.Float,
                        true,
                        { tile: tile, onBridge: false },
                        { tile: tile, onBridge: false }
                    );
                    if (path) {
                        waterPoints.push(new Vector2(x, y));
                    }
                }
            }
        }
    }

    if (waterPoints.length === 0) {
        // 如果没有找到水域点，可能需要使用更小的采样间隔
        if (sectorSize > 2) {
            return getAllWaterPoints(gameApi, Math.floor(sectorSize / 2));
        }
    }

    return waterPoints;
}

// 获取最终可达的水域位置
function getFinalReachablePoint(gameApi: GameApi, startPoint: Vector2, targetPoint: Vector2): Vector2 | null {
    const startTile = gameApi.mapApi.getTile(startPoint.x, startPoint.y);
    const targetTile = gameApi.mapApi.getTile(targetPoint.x, targetPoint.y);
    
    if (!startTile || !targetTile) {
        return null;
    }

    const path = gameApi.mapApi.findPath(
        SpeedType.Float,
        true,
        { tile: startTile, onBridge: false },
        { tile: targetTile, onBridge: false }
    );

    if (!path || path.length === 0) {
        return null;
    }

    const lastNode = path[path.length - 1];
    return new Vector2(lastNode.tile.rx, lastNode.tile.ry);
}

/**
 * 海军侦察任务，使用海军单位进行地图侦察
 */
export class NavalScoutingMission extends Mission {
    private scoutTarget: Vector2 | null = null;
    private attemptsOnCurrentTarget: number = 0;
    private scoutTargetRefreshedAt: number = 0;
    private lastMoveCommandTick: number = 0;
    private scoutTargetIsPermanent: boolean = false;
    private hadUnit: boolean = false;
    private waterPoints: Vector2[] | null = null;
    private visitedWaterPoints: Set<string> = new Set();
    private lastPosition: Vector2 | null = null;
    private lastPositionCheckTick: number = 0;

    constructor(
        uniqueName: string,
        private priority: number,
        logger: DebugLogger,
    ) {
        super(uniqueName, logger);
    }

    private initializeWaterPoints(gameApi: GameApi): void {
        if (this.waterPoints === null) {
            this.waterPoints = getAllWaterPoints(gameApi);
            // 随机打乱水域点顺序，使探索更随机
            for (let i = this.waterPoints.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.waterPoints[i], this.waterPoints[j]] = [this.waterPoints[j], this.waterPoints[i]];
            }
            this.logger(`找到 ${this.waterPoints.length} 个水域探索点`);
        }
    }

    private getNextWaterTarget(gameApi: GameApi, currentPosition: Vector2, matchAwareness: MatchAwareness): Vector2 | null {
        this.initializeWaterPoints(gameApi);
        if (!this.waterPoints || this.waterPoints.length === 0) {
            return null;
        }

        // 从当前位置开始寻找最近的未访问且未被探索的水域点
        let nearestPoint = null;
        let minDistance = Number.MAX_VALUE;
        const sectorCache = matchAwareness.getSectorCache();

        // 更新已探索点集合
        const exploredPoints = new Set<string>();
        this.waterPoints.forEach(point => {
            const sector = sectorCache.getSectorForWorldPosition(point.x, point.y);
            if (sector && sector.sectorVisibilityPct !== undefined && sector.sectorVisibilityPct > 0) {
                exploredPoints.add(`${point.x},${point.y}`);
            }
        });

        // 如果所有点都已访问，但还有未探索的点，重置访问记录
        if (this.visitedWaterPoints.size >= this.waterPoints.length) {
            this.visitedWaterPoints = exploredPoints;
        }

        for (let i = 0; i < this.waterPoints.length; i++) {
            const target = this.waterPoints[i];
            const pointKey = `${target.x},${target.y}`;
            
            // 跳过已访问的点
            if (this.visitedWaterPoints.has(pointKey)) {
                continue;
            }

            // 跳过已探索的点
            if (exploredPoints.has(pointKey)) {
                this.visitedWaterPoints.add(pointKey);
                continue;
            }

            const distance = currentPosition.distanceTo(target);
            if (distance < minDistance) {
                const finalPoint = getFinalReachablePoint(gameApi, currentPosition, target);
                if (finalPoint) {
                    nearestPoint = target;
                    minDistance = distance;
                }
            }
        }

        if (nearestPoint) {
            const pointKey = `${nearestPoint.x},${nearestPoint.y}`;
            this.visitedWaterPoints.add(pointKey);
            this.logger(`选择新的水域探索点 ${nearestPoint.x},${nearestPoint.y}`);
        } else if (this.visitedWaterPoints.size < this.waterPoints.length) {
            this.logger("重新探索未被发现的区域");
        }

        return nearestPoint;
    }

    private isUnitStuck(currentPosition: Vector2): boolean {
        if (!this.lastPosition) {
            return false;
        }
        const dx = Math.abs(currentPosition.x - this.lastPosition.x);
        const dy = Math.abs(currentPosition.y - this.lastPosition.y);
        return dx <= STUCK_THRESHOLD && dy <= STUCK_THRESHOLD;
    }

    public _onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction {
        const scoutNames = ["DLPH", "DEST", "SUB", "HYD", "SQD"];
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

            if (gameApi.getCurrentTick() > this.lastMoveCommandTick + NAVAL_SCOUT_MOVE_COOLDOWN_TICKS) {
                this.lastMoveCommandTick = gameApi.getCurrentTick();
                scouts.forEach((unit) => {
                    if (this.scoutTarget) {
                        actionsApi.orderUnits([unit.id], OrderType.Move, this.scoutTarget.x, this.scoutTarget.y);
                    }
                });
            }

            if (gameApi.mapApi.isVisibleTile(targetTile, playerData.name)) {
                const pointKey = `${this.scoutTarget.x},${this.scoutTarget.y}`;
                this.visitedWaterPoints.add(pointKey);
                this.logger(`目标 ${this.scoutTarget.x},${this.scoutTarget.y} 侦察成功，切换下一个目标`);
                this.setScoutTarget(null, gameApi.getCurrentTick());
            }
        } else {
            // 获取新的侦察目标
            const nextScoutTarget = matchAwareness.getScoutingManager().getNewScoutTarget();
            if (nextScoutTarget) {
                const targetPoint = nextScoutTarget.asVector2();
                if (targetPoint) {
                    // 直接获取最终可达点
                    const finalPoint = getFinalReachablePoint(gameApi, currentPosition, targetPoint);
                    if (finalPoint) {
                        this.setScoutTarget(finalPoint, gameApi.getCurrentTick());
                        this.logger(`前往侦察目标 ${finalPoint.x},${finalPoint.y}`);
                        return noop();
                    }
                }
            }

            // 如果没有可用的侦察目标，选择就近的水域点
            const nextWaterTarget = this.getNextWaterTarget(gameApi, currentPosition, matchAwareness);
            if (nextWaterTarget) {
                this.setScoutTarget(nextWaterTarget, gameApi.getCurrentTick());
            } else {
                this.logger(`没有找到可达的水域探索点，任务结束`);
                return disbandMission();
            }
        }
        return noop();
    }

    setScoutTarget(target: Vector2 | null, currentTick: number) {
        this.attemptsOnCurrentTarget = 0;
        this.scoutTargetRefreshedAt = currentTick;
        this.scoutTarget = target;
        this.scoutTargetIsPermanent = false;
        // 重置位置检查
        this.lastPosition = null;
        this.lastPositionCheckTick = currentTick;
    }

    public getGlobalDebugText(): string | undefined {
        return "海军侦察中";
    }

    public getPriority() {
        return this.priority;
    }
}

export class NavalScoutingMissionFactory implements MissionFactory {
    constructor(private lastScoutAt: number = -300) {}

    getName(): string {
        return "NavalScoutingMissionFactory";
    }

    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
        // 每300个tick检查一次是否需要创建新的海军侦察任务
        if (gameApi.getCurrentTick() < this.lastScoutAt + 300) {
            return;
        }
        if (!matchAwareness.getScoutingManager().hasScoutTargets()) {
            return;
        }
        if (!missionController.addMission(new NavalScoutingMission("navalScout", 10, logger))) {
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
        if (failedMission instanceof NavalScoutingMission) {
            missionController.addMission(new NavalScoutingMission("navalScout", 10, logger));
            this.lastScoutAt = gameApi.getCurrentTick();
        }
    }
} 