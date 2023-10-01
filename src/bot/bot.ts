import {
    OrderType,
    ApiEventType,
    Bot,
    GameApi,
    ApiEvent,
    TechnoRules,
    QueueType,
    QueueStatus,
    Point2D,
    MapApi,
    ObjectType,
    FactoryType,
    AttackState,
    PlayerData,
} from "@chronodivide/game-api";
import PriorityQueue from "priority-queue-typescript";

import { Duration } from "luxon";

import { determineMapBounds, getDistanceBetweenPoints, getPointTowardsOtherPoint } from "./logic/map/map.js";
import { SectorCache } from "./logic/map/sector.js";
import { MissionController } from "./logic/mission/missionController.js";
import { SquadController } from "./logic/squad/squadController.js";
import { GlobalThreat } from "./logic/threat/threat.js";
import { calculateGlobalThreat } from "./logic/threat/threatCalculator.js";
import { QUEUES, QueueController, queueTypeToName } from "./logic/building/queueController.js";
import { ExpansionMission } from "./logic/mission/expansionMission.js";

enum BotState {
    Initial = "init",
    Deployed = "deployed",
    Attacking = "attack",
    Defending = "defend",
    Scouting = "scout",
    Defeated = "defeat",
}

const DEBUG_TIMESTAMP_OUTPUT_INTERVAL_SECONDS = 60;
const NATURAL_TICK_RATE = 15;
const BOT_AUTO_SURRENDER_TIME_SECONDS = 7200; // 2 hours (approx 30 mins in real game)

export class SupalosaBot extends Bot {
    private botState = BotState.Initial;
    private tickRatio!: number;
    private enemyPlayers!: string[];
    private knownMapBounds: Point2D | undefined;
    private sectorCache: SectorCache | undefined;
    private threatCache: GlobalThreat | undefined;
    private missionController: MissionController;
    private squadController: SquadController;
    private queueController: QueueController;
    private tickOfLastAttackOrder: number = 0;

    private enableLogging: boolean;

    constructor(name: string, country: string, enableLogging = true) {
        super(name, country);
        this.missionController = new MissionController((message) => this.logBotStatus(message));
        this.squadController = new SquadController();
        this.queueController = new QueueController();
        this.enableLogging = enableLogging;
    }

    override onGameStart(game: GameApi) {
        const gameRate = game.getTickRate();
        const botApm = 300;
        const botRate = botApm / 60;
        this.tickRatio = Math.ceil(gameRate / botRate);

        this.enemyPlayers = game.getPlayers().filter((p) => p !== this.name && !game.areAlliedPlayers(this.name, p));

        this.knownMapBounds = determineMapBounds(game.mapApi);
        this.sectorCache = new SectorCache(game.mapApi, this.knownMapBounds);
        this.threatCache = undefined;

        this.logBotStatus(`Map bounds: ${this.knownMapBounds.x}, ${this.knownMapBounds.y}`);
    }

    override onGameTick(game: GameApi) {
        if ((game.getCurrentTick() / NATURAL_TICK_RATE) % DEBUG_TIMESTAMP_OUTPUT_INTERVAL_SECONDS === 0) {
            this.logDebugState(game);
        }
        if (game.getCurrentTick() % this.tickRatio === 0) {
            const myPlayer = game.getPlayerData(this.name);
            const sectorsToUpdatePerCycle = 8; // TODO tune this
            this.sectorCache?.updateSectors(game.getCurrentTick(), sectorsToUpdatePerCycle, game.mapApi, myPlayer);
            let updateRatio = this.sectorCache?.getSectorUpdateRatio(game.getCurrentTick() - game.getTickRate() * 60);
            if (updateRatio && updateRatio < 1.0) {
                this.logBotStatus(`${updateRatio * 100.0}% of sectors updated in last 60 seconds.`);
            }

            // Threat decays over time if we haven't killed anything
            let boredomFactor =
                1.0 -
                Math.min(1.0, Math.max(0.0, (this.gameApi.getCurrentTick() - this.tickOfLastAttackOrder) / 1600.0));
            let shouldAttack = this.threatCache ? this.isWorthAttacking(this.threatCache, boredomFactor) : false;
            if (game.getCurrentTick() % (this.tickRatio * 150) == 0) {
                let visibility = this.sectorCache?.getOverallVisibility();
                if (visibility) {
                    this.logBotStatus(`${Math.round(visibility * 1000.0) / 10}% of tiles visible. Calculating threat.`);
                    this.threatCache = calculateGlobalThreat(game, myPlayer, visibility);
                    this.logBotStatus(
                        `Threat LAND: Them ${Math.round(this.threatCache.totalOffensiveLandThreat)}, us: ${Math.round(
                            this.threatCache.totalAvailableAntiGroundFirepower
                        )}.`
                    );
                    this.logBotStatus(
                        `Threat DEFENSIVE: Them ${Math.round(this.threatCache.totalDefensiveThreat)}, us: ${Math.round(
                            this.threatCache.totalDefensivePower
                        )}.`
                    );
                    this.logBotStatus(
                        `Threat AIR: Them ${Math.round(this.threatCache.totalOffensiveAirThreat)}, us: ${Math.round(
                            this.threatCache.totalAvailableAntiAirFirepower
                        )}.`
                    );
                    this.logBotStatus(`Boredom: ${boredomFactor}`);
                }
            }
            if (game.getCurrentTick() / NATURAL_TICK_RATE > BOT_AUTO_SURRENDER_TIME_SECONDS) {
                this.logBotStatus(`Auto-surrendering after ${BOT_AUTO_SURRENDER_TIME_SECONDS} seconds.`);
                this.botState = BotState.Defeated;
                this.actionsApi.quitGame();
            }

            // hacky resign condition
            const armyUnits = game.getVisibleUnits(this.name, "self", (r) => r.isSelectableCombatant);
            const mcvUnits = game.getVisibleUnits(
                this.name,
                "self",
                (r) => !!r.deploysInto && game.getGeneralRules().baseUnit.includes(r.name)
            );
            const productionBuildings = game.getVisibleUnits(
                this.name,
                "self",
                (r) => r.type == ObjectType.Building && r.factory != FactoryType.None
            );
            if (armyUnits.length == 0 && productionBuildings.length == 0 && mcvUnits.length == 0) {
                this.logBotStatus(`No army or production left, quitting.`);
                this.botState = BotState.Defeated;
                this.actionsApi.quitGame();
            }

            // Build logic.
            this.queueController.onAiUpdate(
                game,
                this.productionApi,
                this.actionsApi,
                myPlayer,
                this.threatCache,
                (message) => this.logBotStatus(message)
            );

            // Mission logic.
            this.missionController.onAiUpdate(game, myPlayer, this.threatCache, this.squadController);

            // Squad logic.
            this.squadController.onAiUpdate(game, this.actionsApi, myPlayer, this.threatCache, (message) =>
                this.logBotStatus(message)
            );

            switch (this.botState) {
                case BotState.Initial: {
                    this.missionController.addMission(new ExpansionMission("initialExpand", 100));
                    let conYards = game.getVisibleUnits(this.name, "self", (r) => r.constructionYard);
                    if (conYards.length) {
                        this.botState = BotState.Deployed;
                        break;
                    }
                    break;
                }
                case BotState.Deployed: {
                    this.botState = BotState.Attacking;
                    break;
                }
                case BotState.Attacking: {
                    const armyUnits = game.getVisibleUnits(this.name, "self", (r) => r.isSelectableCombatant);
                    if (!shouldAttack) {
                        this.logBotStatus(`Not worth attacking, reverting to defence.`);
                        this.botState = BotState.Defending;
                    }
                    const enemyBuildings = game.getVisibleUnits(this.name, "hostile");
                    let foundTarget = false;
                    if (enemyBuildings.length) {
                        const weightedTargets = enemyBuildings
                            .filter((unit) => this.isHostileUnit(game, unit))
                            .map((unitId) => {
                                let unit = game.getUnitData(unitId);
                                return {
                                    unit,
                                    unitId: unitId,
                                    weight: getDistanceBetweenPoints(myPlayer.startLocation, {
                                        x: unit!.tile.rx,
                                        y: unit!.tile.rx,
                                    }),
                                };
                            })
                            .filter((unit) => unit.unit != null);
                        weightedTargets.sort((targetA, targetB) => {
                            return targetA.weight - targetB.weight;
                        });
                        const target = weightedTargets.find((_) => true);
                        if (target !== undefined) {
                            let targetData = target.unit;
                            for (const unitId of armyUnits) {
                                const unit = game.getUnitData(unitId);
                                foundTarget = true;
                                if (shouldAttack && unit?.isIdle) {
                                    let orderType: OrderType = OrderType.AttackMove;
                                    if (targetData?.type == ObjectType.Building) {
                                        orderType = OrderType.Attack;
                                    } else if (targetData?.rules.canDisguise) {
                                        // Special case for mirage tank/spy as otherwise they just sit next to it.
                                        orderType = OrderType.Attack;
                                    }
                                    this.actionsApi.orderUnits([unitId], orderType, target.unitId);
                                }
                            }
                        }
                    }
                    if (!foundTarget) {
                        this.logBotStatus(`Can't see any targets, scouting.`);
                        this.botState = BotState.Scouting;
                    }
                    break;
                }
                case BotState.Defending: {
                    const armyUnits = game.getVisibleUnits(this.name, "self", (r) => r.isSelectableCombatant);
                    const enemy = game.getPlayerData(this.enemyPlayers[0]);
                    const fallbackPoint = getPointTowardsOtherPoint(
                        game,
                        myPlayer.startLocation,
                        enemy.startLocation,
                        10,
                        10,
                        0
                    );

                    armyUnits.forEach((armyUnitId) => {
                        let unit = game.getUnitData(armyUnitId);
                        if (unit && !unit.guardMode) {
                            let distanceToFallback = getDistanceBetweenPoints(
                                { x: unit.tile.rx, y: unit.tile.ry },
                                fallbackPoint
                            );
                            if (distanceToFallback > 10) {
                                this.actionsApi.orderUnits(
                                    [armyUnitId],
                                    OrderType.GuardArea,
                                    fallbackPoint.x,
                                    fallbackPoint.y
                                );
                            }
                        }
                    });
                    if (shouldAttack) {
                        this.logBotStatus(`Finished defending, ready to attack.`);
                        this.botState = BotState.Attacking;
                    }
                    break;
                }
                case BotState.Scouting: {
                    const armyUnits = game.getVisibleUnits(this.name, "self", (r) => r.isSelectableCombatant);
                    let candidatePoints: Point2D[] = [];

                    // Move to an unseen starting location.
                    const unseenStartingLocations = game.mapApi.getStartingLocations().filter((startingLocation) => {
                        if (startingLocation == game.getPlayerData(this.name).startLocation) {
                            return false;
                        }
                        let tile = game.mapApi.getTile(startingLocation.x, startingLocation.y);
                        return tile ? !game.mapApi.isVisibleTile(tile, this.name) : false;
                    });
                    candidatePoints.push(...unseenStartingLocations);

                    armyUnits.forEach((unitId) => {
                        if (candidatePoints.length > 0) {
                            const unit = game.getUnitData(unitId);
                            if (unit?.isIdle) {
                                const scoutLocation =
                                    candidatePoints[Math.floor(game.generateRandom() * candidatePoints.length)];
                                this.actionsApi.orderUnits(
                                    [unitId],
                                    OrderType.AttackMove,
                                    scoutLocation.x,
                                    scoutLocation.y
                                );
                            }
                        }
                    });
                    const enemyBuildings = game
                        .getVisibleUnits(this.name, "hostile")
                        .filter((unit) => this.isHostileUnit(game, unit));
                    if (enemyBuildings.length > 0) {
                        this.logBotStatus(`Scouted a target, reverting to attack mode.`);
                        this.botState = BotState.Attacking;
                    }
                    break;
                }

                default:
                    break;
            }
        }
    }

    private getHumanTimestamp(game: GameApi) {
        return Duration.fromMillis((game.getCurrentTick() / NATURAL_TICK_RATE) * 1000).toFormat("hh:mm:ss");
    }

    private logBotStatus(message: string) {
        if (!this.enableLogging) {
            return;
        }
        console.log(`[${this.getHumanTimestamp(this.gameApi)} ${this.name} ${this.botState}] ${message}`);
    }

    private logDebugState(game: GameApi) {
        const myPlayer = game.getPlayerData(this.name);
        const queueState = QUEUES.reduce((prev, queueType) => {
            if (this.productionApi.getQueueData(queueType).size === 0) {
                return prev;
            }
            const paused = this.productionApi.getQueueData(queueType).status === QueueStatus.OnHold;
            return (
                prev +
                " [" +
                queueTypeToName(queueType) +
                (paused ? " PAUSED" : "") +
                ": " +
                this.productionApi.getQueueData(queueType).items.map((item) => item.rules.name + "x" + item.quantity) +
                "]"
            );
        }, "");
        this.logBotStatus(`----- Cash: ${myPlayer.credits} ----- | Queues: ${queueState}`);
        const harvesters = game.getVisibleUnits(this.name, "self", (r) => r.harvester).length;
        this.logBotStatus(`Harvesters: ${harvesters}`);
        this.logBotStatus(`----- End -----`);
    }

    private isWorthAttacking(threatCache: GlobalThreat, threatFactor: number) {
        let scaledGroundPower = Math.pow(threatCache.totalAvailableAntiGroundFirepower, 1.125);
        let scaledGroundThreat =
            (threatFactor * threatCache.totalOffensiveLandThreat + threatCache.totalDefensiveThreat) * 1.1;

        let scaledAirPower = Math.pow(threatCache.totalAvailableAirPower, 1.125);
        let scaledAirThreat =
            (threatFactor * threatCache.totalOffensiveAntiAirThreat + threatCache.totalDefensiveThreat) * 1.1;

        return scaledGroundPower > scaledGroundThreat || scaledAirPower > scaledAirThreat;
    }

    private isHostileUnit(game: GameApi, unitId: number) {
        const unitData = game.getUnitData(unitId);
        if (!unitData) {
            return false;
        }

        return unitData.owner != this.name && game.getPlayerData(unitData.owner)?.isCombatant;
    }

    override onGameEvent(ev: ApiEvent) {
        switch (ev.type) {
            case ApiEventType.ObjectDestroy: {
                // Add to the stalemate detection.
                if (ev.attackerInfo?.playerName == this.name) {
                    this.tickOfLastAttackOrder += (this.gameApi.getCurrentTick() - this.tickOfLastAttackOrder) / 2;
                }
                break;
            }
            default:
                break;
        }
    }
}
