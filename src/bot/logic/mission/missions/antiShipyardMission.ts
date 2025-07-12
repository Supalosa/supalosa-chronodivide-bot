import {
    ActionsApi,
    OrderType,
    GameApi,
    PlayerData,
    Vector2,
    SideType,
    SpeedType,
    LandType,
} from "@chronodivide/game-api";
import { MatchAwareness } from "../../awareness.js";
import {
    Mission,
    MissionAction,
    requestUnits,
    noop,
} from "../mission.js";
import { ActionBatcher, BatchableAction } from "../actionBatcher.js";
import { DebugLogger, countBy } from "../../common/utils.js";
import { MissionFactory } from "../missionFactories.js";
import { MissionController } from "../missionController.js";

/**
 * 一个简单的“反造船厂”任务：
 *  - 发现敌军船厂后，快速造 3 潜艇或 5 海豚
 *  - 单位到齐后直接 Attack-Move 到敌方船厂位置
 */
export class AntiShipyardMission extends Mission<null> {
    private readonly targetPos: Vector2;
    private readonly requiredUnits: Record<string, number>;
    private shipyardId: number | null;
    private stage: "gather" | "approach" | "patrol" | "destroy" = "gather";
    private rallyPoint: Vector2;
    private patrolPoints: Vector2[] = [];
    private currentPatrolIdx = 0;
    private lastHostileTick = 0;
    private initialized = false;
    // cooldown control for reposition logic
    private lastRepositionTick = 0;

    /**
     * 判断 from → to 射线沿途是否存在“≥2 格宽”的可通行水面走廊。
     * corridorHalfWidth = 1 代表中心线两侧各检查 1 格 (共 3×3 检查区域)，满足“2 格宽度”要求。
     */
    private hasClearWaterLoS(
        gameApi: GameApi,
        from: Vector2,
        to: Vector2,
        corridorHalfWidth: number = 1,
    ): boolean {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        if (steps === 0) return true;

        for (let i = 0; i <= steps; i++) {
            const cx = Math.round(from.x + (dx * i) / steps);
            const cy = Math.round(from.y + (dy * i) / steps);

            // 扫描中心 tile 周围 corridorHalfWidth 范围内的所有 tile，确保无遮挡
            for (let ox = -corridorHalfWidth; ox <= corridorHalfWidth; ox++) {
                for (let oy = -corridorHalfWidth; oy <= corridorHalfWidth; oy++) {
                    const tx = cx + ox;
                    const ty = cy + oy;
                    const tile = gameApi.mapApi.getTile(tx, ty);
                    if (!tile) return false; // 越界即阻挡

                    // 若为非 Clear/Water 或 桥梁覆盖，则视为阻挡
                    if ((tile.landType !== LandType.Clear && tile.landType !== LandType.Water) || tile.onBridgeLandType !== undefined) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    /** 在船厂周围随机寻找一个水面、且射线无遮挡的位置 */
    private findWaterFiringPoint(
        gameApi: GameApi,
        radiusMin: number,
        radiusMax: number,
        attempts: number = 10,
    ): Vector2 | null {
        for (let attempt = 0; attempt < attempts; attempt++) {
            const ang = gameApi.generateRandom() * Math.PI * 2;
            const radius = radiusMin + gameApi.generateRandom() * (radiusMax - radiusMin);
            const dest = this.targetPos.add(
                new Vector2(Math.round(Math.cos(ang) * radius), Math.round(Math.sin(ang) * radius)),
            );
            const tile = gameApi.mapApi.getTile(dest.x, dest.y);
            if (!tile) continue;
            if (tile.landType !== LandType.Water || tile.onBridgeLandType !== undefined) continue;
            // 必须要有到船厂的无遮挡射线
            if (!this.hasClearWaterLoS(gameApi, dest, this.targetPos)) continue;
            return dest;
        }
        return null;
    }

    /** 对 toPoint 的安全封装：若目的地 tile 非法则忽略该命令 */
    private pushToPointSafe(
        gameApi: GameApi,
        actionBatcher: ActionBatcher,
        unitId: number,
        orderType: OrderType,
        point: Vector2,
    ) {
        if (gameApi.mapApi.getTile(point.x, point.y)) {
            actionBatcher.push(BatchableAction.toPoint(unitId, orderType, point));
        }
    }

    constructor(
        uniqueName: string,
        targetPos: Vector2,
        wantSubs: boolean,
        logger: DebugLogger,
    ) {
        super(uniqueName, logger);
        this.targetPos = targetPos;
        this.shipyardId = null;

        this.rallyPoint = targetPos; // temporary, will be set in _onAiUpdate
        this.requiredUnits = wantSubs ? { SUB: 3 } : { DLPH: 5 };
    }

    /** 高优先级，保证能抢到潜艇 / 海豚 */
    getPriority(): number {
        return 80;
    }

    /** 允许别的任务从我这再抢回单位 */
    isUnitsLocked(): boolean {
        return false;
    }

    getGlobalDebugText(): string | undefined {
        return `AntiShipyard → (${this.targetPos.x},${this.targetPos.y})`;
    }

    _onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction {
        // Initialize rally point on first call
        if (!this.initialized) {
            // 使用当前小队中任意一个单位的位置作为起始点
            const squadUnits = this.getUnits(gameApi);
            // fallback: 使用我方船厂位置
            let startPos = this.targetPos; // worst case fallback
            const ourShipyards = gameApi.getVisibleUnits(playerData.name, "self", r => r.name === "GAYARD" || r.name === "NAYARD");
            if (ourShipyards.length > 0) {
                const ourYard = gameApi.getUnitData(ourShipyards[0]);
                if (ourYard) {
                    startPos = new Vector2(ourYard.tile.rx, ourYard.tile.ry);
                }
            }
            if (squadUnits.length > 0) {
                const firstUnit = squadUnits[0];
                startPos = new Vector2(firstUnit.tile.rx, firstUnit.tile.ry);
            }
            
            const startTile = gameApi.mapApi.getTile(startPos.x, startPos.y);
            const endTile = gameApi.mapApi.getTile(this.targetPos.x, this.targetPos.y);
            let mid = startPos;
            if (startTile && endTile) {
                const path = gameApi.mapApi.findPath(
                    SpeedType.Float,
                    false,
                    { tile: startTile, onBridge: false },
                    { tile: endTile, onBridge: false },
                );
                if (path && path.length > 2) {
                    const midNode = path[Math.floor(path.length / 5 * 4)];
                    mid = new Vector2(midNode.tile.rx, midNode.tile.ry);
                }
            }
            this.rallyPoint = mid;
            this.initialized = true;
        }

        // 1. 统计当前已拥有的目标单位
        const currentComp = countBy(this.getUnitsGameObjectData(gameApi), (u) => u.name);
        const missing = Object.entries(this.requiredUnits).filter(
            ([unitName, want]) => (currentComp[unitName] || 0) < want,
        );

        if (missing.length > 0) {
            // 请求缺口单位
            return requestUnits(
                missing.map(([name]) => name),
                /* priority */ this.getPriority(),
            );
        }

        // ----------------- 阶段逻辑 -----------------
        const SIGHT_RADIUS = 12;
        const squadUnits = this.getUnits(gameApi);

        // --- GATHER ---
        if (this.stage === "gather") {
            const allClose = squadUnits.every((u) =>
                new Vector2(u.tile.rx, u.tile.ry).distanceTo(this.rallyPoint) <= 4,
            );

            if (!allClose) {
                squadUnits.forEach((u) => {
                    this.pushToPointSafe(gameApi, actionBatcher, u.id, OrderType.Move, this.rallyPoint);
                });
                return noop();
            }

            // 到齐后生成巡逻点
            if (this.patrolPoints.length === 0) {
                for (let i = 0; i < 3; i++) {
                    const ang = (Math.PI * 2 * i) / 3;
                    const pt = this.targetPos.add(
                        new Vector2(Math.round(Math.cos(ang) * 6), Math.round(Math.sin(ang) * 6)),
                    );
                    this.patrolPoints.push(pt);
                }
            }
            this.stage = "approach";
            this.lastHostileTick = gameApi.getCurrentTick();
        }

        // --- APPROACH ---
        if (this.stage === "approach") {
            const nearShipyard = squadUnits.every((u) =>
                new Vector2(u.tile.rx, u.tile.ry).distanceTo(this.targetPos) <= SIGHT_RADIUS,
            );

            if (nearShipyard) {
                this.stage = "patrol";
            } else {
                // 从集结点前往船厂，使用 AttackMove 清理路上敌人
                squadUnits.forEach((u) => {
                    this.pushToPointSafe(gameApi, actionBatcher, u.id, OrderType.AttackMove, this.targetPos);
                });
                return noop();
            }
        }

        // hostiles near shipyard
        const hostiles = matchAwareness.getHostilesNearPoint2d(this.targetPos, SIGHT_RADIUS);
        if (hostiles.length > 0) {
            this.lastHostileTick = gameApi.getCurrentTick();
        }

        // --- PATROL ---
        if (this.stage === "patrol") {
            // 搜索船厂附近的敌方海军单位 (speedtype = float)
            const nearbyEnemyNaval = gameApi
                .getVisibleUnits(playerData.name, "enemy")
                .map(id => gameApi.getUnitData(id))
                .filter((unit): unit is NonNullable<typeof unit> => {
                    if (!unit) return false;
                    const distance = new Vector2(unit.tile.rx, unit.tile.ry).distanceTo(this.targetPos);
                    return distance <= SIGHT_RADIUS && unit.rules.speedType === SpeedType.Float;
                });

            if (nearbyEnemyNaval.length > 0) {
                this.lastHostileTick = gameApi.getCurrentTick();
                // 攻击最近的敌方海军单位
                squadUnits.forEach((u) => {
                    let closestEnemy = nearbyEnemyNaval[0];
                    let minDistance = new Vector2(u.tile.rx, u.tile.ry).distanceTo(new Vector2(closestEnemy.tile.rx, closestEnemy.tile.ry));
                    
                    for (const enemy of nearbyEnemyNaval) {
                        const distance = new Vector2(u.tile.rx, u.tile.ry).distanceTo(new Vector2(enemy.tile.rx, enemy.tile.ry));
                        if (distance < minDistance) {
                            closestEnemy = enemy;
                            minDistance = distance;
                        }
                    }
                     
                     if (closestEnemy) {
                         actionBatcher.push(BatchableAction.toTargetId(u.id, OrderType.Attack, closestEnemy.id));
                     }
                });
                return noop();
            }

            // 45 tick (~3 秒) 无海军敌人则切 destroy
            if (gameApi.getCurrentTick() - this.lastHostileTick > 45) {
                this.stage = "destroy";
            } else {
                // 继续巡逻，使用普通Move避免拥挤
                squadUnits.forEach((u) => {
                    // 给每个单位分配略微不同的巡逻位置
                    const jitter = new Vector2(
                        gameApi.generateRandomInt(-2, 2),
                        gameApi.generateRandomInt(-2, 2)
                    );
                    const dest = this.targetPos.add(jitter);
                    this.pushToPointSafe(gameApi, actionBatcher, u.id, OrderType.Move, dest);
                });
                return noop();
            }
        }

        // --- DESTROY ---
        const visibleShipyards = gameApi
            .getVisibleUnits(playerData.name, "enemy", (r) => r.name === "GAYARD" || r.name === "NAYARD")
            .map((id) => gameApi.getUnitData(id))
            .filter((u): u is NonNullable<typeof u> => !!u);

        // 如有新敌方海军出现，优先击杀
        const enemyNavalDestroy = gameApi
            .getVisibleUnits(playerData.name, "enemy")
            .map((id) => gameApi.getUnitData(id))
            .filter((unit): unit is NonNullable<typeof unit> => {
                if (!unit) return false;
                const distance = new Vector2(unit.tile.rx, unit.tile.ry).distanceTo(this.targetPos);
                return distance <= SIGHT_RADIUS && unit.rules.speedType === SpeedType.Float;
            });

        if (enemyNavalDestroy.length > 0) {
            squadUnits.forEach((u) => {
                // 寻找最近敌人
                let closest = enemyNavalDestroy[0];
                let minDist = new Vector2(u.tile.rx, u.tile.ry).distanceTo(new Vector2(closest.tile.rx, closest.tile.ry));
                for (const e of enemyNavalDestroy) {
                    const d = new Vector2(u.tile.rx, u.tile.ry).distanceTo(new Vector2(e.tile.rx, e.tile.ry));
                    if (d < minDist) {
                        closest = e;
                        minDist = d;
                    }
                }
                actionBatcher.push(BatchableAction.toTargetId(u.id, OrderType.Attack, closest.id));
            });
            return noop();
        }

        // 主目标：船厂
        if (visibleShipyards.length > 0) {
            const target = visibleShipyards[0]!;

            // 针对每个单位检查射击路径，必要时调整位置
            squadUnits.forEach((u) => {
                const unitPos = new Vector2(u.tile.rx, u.tile.ry);
                const clearLoS = this.hasClearWaterLoS(gameApi, unitPos, this.targetPos);
                if (clearLoS) {
                    actionBatcher.push(BatchableAction.toTargetId(u.id, OrderType.Attack, target.id));
                } else {
                    // 避免过于频繁 reposition
                    if (gameApi.getCurrentTick() - this.lastRepositionTick < 30) {
                        return;
                    }
                    const newPos = this.findWaterFiringPoint(gameApi, 5, 8);
                    if (newPos) {
                        this.pushToPointSafe(gameApi, actionBatcher, u.id, OrderType.AttackMove, newPos);
                        this.lastRepositionTick = gameApi.getCurrentTick();
                    } else {
                        // 找不到合适位置，维持 AttackMove 到船厂
                        this.pushToPointSafe(gameApi, actionBatcher, u.id, OrderType.AttackMove, this.targetPos);
                    }
                }
            });
        } else {
            squadUnits.forEach((u) => {
                this.pushToPointSafe(gameApi, actionBatcher, u.id, OrderType.AttackMove, this.targetPos);
            });
        }

        return noop();
    }
}

export class AntiShipyardMissionFactory implements MissionFactory {
    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
        // 已存在则跳过
        if (missionController.getMissions().some((m) => m instanceof AntiShipyardMission)) {
            return;
        }

        const enemyShipyards = gameApi.getVisibleUnits(playerData.name, "enemy", (r) =>
            r.name === "GAYARD" || r.name === "NAYARD",
        );
        if (enemyShipyards.length === 0) return;

        const shipyardData = gameApi.getUnitData(enemyShipyards[0]);
        if (!shipyardData) return;
        const targetPos = new Vector2(shipyardData.tile.rx, shipyardData.tile.ry);

        const wantSubs = playerData.country?.side === SideType.Nod; // nod = soviet -> sub

        const mission = new AntiShipyardMission(
            "antiShipyard_" + gameApi.getCurrentTick(),
            targetPos,
            wantSubs,
            logger,
        );
        missionController.addMission(mission);
    }

    getName(): string {
        return "AntiShipyardMissionFactory";
    }

    onMissionFailed(
        _gameApi: GameApi,
        _playerData: PlayerData,
        _matchAwareness: MatchAwareness,
        _failedMission: Mission<any>,
        _failureReason: any,
        _missionController: MissionController,
        _logger: DebugLogger,
    ): void {
        // no-op
    }
}
