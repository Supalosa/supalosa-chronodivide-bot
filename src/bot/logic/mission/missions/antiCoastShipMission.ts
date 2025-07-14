import {
    ActionsApi,
    GameApi,
    OrderType,
    PlayerData,
    Vector2,
    LandType,
    SpeedType,
    MovementZone,
} from "@chronodivide/game-api";
import { Mission, MissionAction, requestUnits, noop, disbandMission, grabCombatants } from "../mission.js";
import { ActionBatcher, BatchableAction } from "../actionBatcher.js";
import { MatchAwareness } from "../../awareness.js";
import { DebugLogger, countBy } from "../../common/utils.js";
import { pushToPointSafe } from "../../common/navalUtils.js";
import { MissionFactory } from "../missionFactories.js";
import { MissionController } from "../missionController.js";

/**
 * 抵御盟军驱逐舰贴岸骚扰：召集 3 辆犀牛 (MTNK) 前往岸边并攻击 DEST。
 */
export class AntiCoastShipMission extends Mission<null> {
    private readonly requiredUnits: Record<string, number> = { MTNK: 3 };
    private readonly targetId: number;
    private readonly targetPos: Vector2;
    private stage: "gather" | "attack" = "gather";

    constructor(uniqueName: string, targetId: number, targetPos: Vector2, logger: DebugLogger) {
        super(uniqueName, logger);
        this.targetId = targetId;
        this.targetPos = targetPos;
    }

    getPriority(): number {
        return 500;
    }

    isUnitsLocked(): boolean {
        return false;
    }

    getGlobalDebugText(): string | undefined {
        return `AntiCoast → DEST#${this.targetId}`;
    }

    _onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction {
        // 驱逐舰是否仍存活
        const destData = gameApi.getUnitData(this.targetId);
        if (!destData) {
            return disbandMission();
        }
        this.targetPos.set(destData.tile.rx, destData.tile.ry);

        // 统计现有 MTNK
        const currentComp = countBy(this.getUnitsGameObjectData(gameApi), (u) => u.name);
        const missing = Object.entries(this.requiredUnits).filter(
            ([unit, want]) => (currentComp[unit] || 0) < want,
        );
        if (missing.length > 0) {
            // 同时申请制造缺口坦克，并立即抓取附近所有可用战斗单位参与岸防
            const requested = requestUnits(missing.map(([u]) => u), this.getPriority());
            const grab = grabCombatants(playerData.startLocation, this.getPriority());
            // 返回 grab，让 MissionController 把自由战斗单位分配过来；请求会在 updateUnitTypes 被记录
            return grab;
        }

        const squadUnits = this.getUnits(gameApi);
        if (this.stage === "gather") {
            // simple gather: units move towards rally point near base
            const rally = playerData.startLocation;
            const allClose = squadUnits.every(
                (u) => new Vector2(u.tile.rx, u.tile.ry).distanceTo(rally) <= 4,
            );
            if (!allClose) {
                squadUnits.forEach((u) => pushToPointSafe(gameApi, actionBatcher, u.id, OrderType.Move, rally));
                return noop();
            }
            this.stage = "attack";
        }

        // ATTACK stage
        squadUnits.forEach((u) => {
            // 对地单位使用 AttackMove 到驱逐舰当前坐标附近 2 格内岸边
            pushToPointSafe(gameApi, actionBatcher, u.id, OrderType.AttackMove, this.targetPos);
        });
        return noop();
    }
}

export class AntiCoastShipMissionFactory implements MissionFactory {
    getName() {
        return "AntiCoastShipMissionFactory";
    }

    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
        // skip if mission already exists
        if (missionController.getMissions().some((m) => m instanceof AntiCoastShipMission)) return;

        // 感兴趣的舰船列表
        const COAST_THREAT_UNITS = ["DEST", "AEGIS", "CARRIER", "DRED", "HYD"];

        const coastThreats = gameApi
            .getVisibleUnits(playerData.name, "enemy", (r) => COAST_THREAT_UNITS.includes(r.name))
            .filter((id) => {
                const u = gameApi.getUnitData(id);
                if (!u) return false;
                if (u.rules.movementZone !== MovementZone.Water) return false;

                // 尝试寻路；如果陆路能靠近并且终点离目标 <= 6 格则认为可打
                try {
                    const startTile = gameApi.mapApi.getTile(playerData.startLocation.x, playerData.startLocation.y);
                    const targetTile = gameApi.mapApi.getTile(u.tile.rx, u.tile.ry);
                    if (!startTile || !targetTile) return false;

                    const path = gameApi.mapApi.findPath(
                        SpeedType.Track,
                        false,
                        { tile: startTile, onBridge: false },
                        { tile: targetTile, onBridge: false },
                    );
                    if (!path || path.length === 0) return false;
                    const endNode = path[0];
                    const distEnd = new Vector2(endNode.tile.rx, endNode.tile.ry).distanceTo(
                        new Vector2(u.tile.rx, u.tile.ry),
                    );
                    return distEnd <= 6;
                } catch (err) {
                    return false;
                }
            });

        if (coastThreats.length === 0) return;

        const destId = coastThreats[0];
        const destData = gameApi.getUnitData(destId);
        if (!destData) return;
        const pos = new Vector2(destData.tile.rx, destData.tile.ry);

        const mission = new AntiCoastShipMission("antiCoast_" + gameApi.getCurrentTick(), destId, pos, logger);
        missionController.addMission(mission);
    }

    onMissionFailed() {}
} 