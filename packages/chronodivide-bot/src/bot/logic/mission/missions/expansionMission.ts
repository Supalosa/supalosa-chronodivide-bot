import { ActionsApi, Box2, GameApi, GameMath, ObjectType, OrderType, PlayerData, Tile, Vector2 } from "@chronodivide/game-api";
import { Mission, MissionAction, disbandMission, noop, requestSpecificUnits, requestUnits } from "../mission.js";
import { MissionFactory } from "../missionFactories.js";
import { MatchAwareness } from "../../awareness.js";
import { MissionController } from "../missionController.js";
import { DebugLogger, maxBy, minBy, toPathNode, toVector2 } from "../../common/utils.js";
import { ActionBatcher } from "../actionBatcher.js";
import { getCachedTechnoRules } from "../../common/rulesCache.js";

const ORDER_COOLDOWN_TICKS = 60;

const mcvTypes = ["AMCV", "SMCV"];

const CONYARD_SCAN_DISTANCE = 15;
const CONYARD_DEPLOY_DISTANCE = 5;
/**
 * A mission that tries to create an MCV (if it doesn't exist) and deploy it somewhere it can be deployed.
 */
export class ExpansionMission extends Mission {
    private destination: Vector2 | null = null;
    private lastOrderAt: number | null = null;

    private lastOrderDeploy = false;

    constructor(
        uniqueName: string,
        private priority: number,
        private selectedMcvId: number | null,
        private candidates: Vector2[],
        logger: DebugLogger,
    ) {
        super(uniqueName, logger);
        if (candidates.length === 1) {
            this.destination = candidates[0];
        } else if (candidates.length === 0) {
            throw new Error("ExpansionMission requires at least one candidate location");
        }
    }

    public _onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction {
        const mcvs = this.getUnitsOfTypes(gameApi, ...mcvTypes);
        if (mcvs.length === 0) {
            // Perhaps we deployed already (or the unit was destroyed), end the mission.
            if (this.lastOrderAt !== null) {
                return disbandMission();
            }
            // We need an mcv!
            if (this.selectedMcvId && !!gameApi.getUnitData(this.selectedMcvId)) {
                return requestSpecificUnits([this.selectedMcvId], this.priority);
            }
            return requestUnits(mcvTypes, this.priority);
        }
        // use the highest-hp MCV
        
        const selectedMcvUnit = maxBy(mcvs, (mcv) => mcv.hitPoints)!;
        this.selectedMcvId = selectedMcvUnit.id ?? null;

        if (this.destination) {
            return this.updateExpand(gameApi, actionsApi, playerData, matchAwareness, actionBatcher);
        } else {
            const reachabilityMap = gameApi.map.getReachabilityMap(selectedMcvUnit.rules.speedType!, false);
            const reachableCandidates = this.candidates
                .map((candidate) => gameApi.mapApi.getTile(candidate.x, candidate.y))
                .filter((t): t is Tile => !!t)
                .filter((t) => reachabilityMap.isReachable(toPathNode(selectedMcvUnit.tile, false), toPathNode(t, false)));
            this.destination = toVector2(minBy(reachableCandidates, (candidate) => {
                return toVector2(selectedMcvUnit.tile).distanceTo(toVector2(candidate));
            })!);
            return noop();
        }
    }

    public updateExpand(gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher
    ) {
        if (!this.destination) {
            return noop();
        }
        const mcvs = this.getUnitsOfTypes(gameApi, ...mcvTypes);
        // if there's a conyard near the destination, we're done.
        const conYards = gameApi
            .getUnitsInArea(new Box2(this.destination.clone().subScalar(CONYARD_SCAN_DISTANCE), this.destination.clone().addScalar(CONYARD_SCAN_DISTANCE)))
            .map((id) => getCachedTechnoRules(gameApi, id))
            .filter((r) => r?.constructionYard);
        if (conYards.length > 0) {
            return disbandMission();
        }
        const isClose = mcvs.some((mcvId) => {
            const tile = mcvId.tile;
            if (!tile) {
                return false;
            }
            const vec = new Vector2(tile.rx, tile.ry);
            return vec.distanceTo(this.destination!) < CONYARD_DEPLOY_DISTANCE;
        });
        const canOrder = !this.lastOrderAt || gameApi.getCurrentTick() > this.lastOrderAt + ORDER_COOLDOWN_TICKS;
        if (!canOrder) {
            return noop();
        }
        if (isClose) {
            if (!this.lastOrderDeploy) {
                actionsApi.orderUnits(
                    mcvs.map((mcv) => mcv.id),
                    OrderType.DeploySelected
                );
                this.lastOrderDeploy = true;
            } else {
                // try to move to a clearer location
                actionsApi.orderUnits(
                    mcvs.map((mcv) => mcv.id),
                    OrderType.Scatter
                );
                this.lastOrderDeploy = false;
            }
            this.lastOrderAt = gameApi.getCurrentTick();
        } else if (!isClose) {
            const rx = this.destination.x + gameApi.generateRandomInt(-5, 5);
            const ry = this.destination.y + gameApi.generateRandomInt(-5, 5);
            if (gameApi.mapApi.getTile(rx, ry)) {
                actionsApi.orderUnits(
                    mcvs.map((mcv) => mcv.id),
                    OrderType.Move,
                    rx,
                    ry,
                );
            }
            this.lastOrderAt = gameApi.getCurrentTick();
        }
        return noop();
    }

    public getGlobalDebugText(): string | undefined {
        return `Expand with MCV ${this.selectedMcvId}`;
    }

    public getPriority() {
        return this.priority;
    }
}

export class PackConyardMission extends Mission {
    constructor(uniqueName: string, private conyardId: number, logger: DebugLogger) {
        super(uniqueName, logger);
    }
    
    public _onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction {
        const conyardOrMcv = gameApi.getGameObjectData(this.conyardId);
        if (!conyardOrMcv) {
            // maybe it died, or unpacked already
            return disbandMission();
        }
        actionsApi.orderUnits(
            [this.conyardId],
            OrderType.Move,
            conyardOrMcv.tile.rx,
            conyardOrMcv.tile.ry,
        );
        return noop();
    }


    public getGlobalDebugText(): string | undefined {
        return `Pack conyard ${this.conyardId}`;
    }

    public getPriority() {
        return 10000;
    }
}


const CONYARD_PACK_COOLDOWN = 15 * 60 * 6; // 6 mins
const DO_NOT_EXPAND_BEFORE_TICKS = 15 * 60 * 6; // 6 minutes

export class ExpansionMissionFactory implements MissionFactory {
    constructor(private lastConyardPackAt = Number.MIN_VALUE) {}
    getName(): string {
        return "ExpansionMissionFactory";
    }

    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
        logger: DebugLogger,
    ): void {
        const mcvs = gameApi.getVisibleUnits(playerData.name, "self", (r) =>
            gameApi.getGeneralRules().baseUnit.includes(r.name),
        );
        const expandToCandidates = matchAwareness.getNextExpansionCandidates();

        // This is used for deploying the initial MCV.
        if (gameApi.getCurrentTick() < DO_NOT_EXPAND_BEFORE_TICKS) {
            mcvs.forEach((mcv) => {
                missionController.addMission(new ExpansionMission("initial-deploy-mcv-" + mcv, 100, mcv, [playerData.startLocation], logger));
            });
        } else if (expandToCandidates.length > 0) {
            mcvs.forEach((mcv) => {
                missionController.addMission(new ExpansionMission("expansion-mcv-" + mcv, 100, mcv, expandToCandidates, logger));
            });
        }

        const threatCache = matchAwareness.getThreatCache();
        if (!expandToCandidates[0] || !threatCache) {
            return;
        }

        if (gameApi.getCurrentTick() < DO_NOT_EXPAND_BEFORE_TICKS || gameApi.getCurrentTick() < this.lastConyardPackAt + CONYARD_PACK_COOLDOWN) {
            return;
        }
        // if we have a war factory and at least 1 refinery, try expand
        const conYards = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.constructionYard)
        const warFactories = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.weaponsFactory);
        const isSafeToExpand = threatCache.totalAvailableAntiGroundFirepower > threatCache.totalOffensiveLandThreat;
        const refineries = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.refinery);
        if (conYards.length === 0 || warFactories.length === 0 || refineries.length === 0 || !isSafeToExpand) {
            return;
        }

        missionController.addMission(new PackConyardMission("pack-up-" + conYards[0], conYards[0], logger));
        logger("Time to pack the conyard and expand", false);
        this.lastConyardPackAt = gameApi.getCurrentTick();
    }

    onMissionFailed(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        failedMission: Mission<any>,
        failureReason: undefined,
        missionController: MissionController,
    ): void {}
}
