import { OrderType, ApiEventType, Bot, GameApi, ApiEvent, TechnoRules, QueueType, QueueStatus, Point2D, MapApi, ObjectType, FactoryType, AttackState, PlayerData } from "@chronodivide/game-api"
import PriorityQueue from "priority-queue-typescript";
import { buildingNameToAiBuildingRules, defaultBuildingPriority, getDefaultPlacementLocation, TechnoRulesWithPriority } from "./logic/building/building.js";
import { determineMapBounds, getDistanceBetweenPoints, getPointTowardsOtherPoint } from "./logic/map/map.js";
import { SectorCache } from "./logic/map/sector.js";
import { missionFactories } from "./logic/mission/mission.js";
import { MissionController } from "./logic/mission/missionController.js";
import { SquadController } from "./logic/squad/squadController.js";
import { GlobalThreat } from "./logic/threat/threat.js";
import { calculateGlobalThreat } from "./logic/threat/threatCalculator.js";

enum BotState {
    Initial,
    Deployed,
    Attacking,
    Defending,
    Scouting,
    Defeated
}

export class ExampleBot extends Bot {
    private botState = BotState.Initial;
    private tickRatio!: number;
    private enemyPlayers!: string[];
    private knownMapBounds: Point2D | undefined;
    private sectorCache: SectorCache | undefined;
    private threatCache: GlobalThreat | undefined;
    private missionController: MissionController;
    private squadController: SquadController;
    private tickOfLastAttackOrder: number = 0;

    constructor(name: string, country: string) {
        super(name, country);
        this.squadController = new SquadController()
        this.missionController = new MissionController();
    }

    override onGameStart(game: GameApi) {
        const gameRate = game.getTickRate();
        const botApm = 300;
        const botRate = botApm / 60;
        this.tickRatio = Math.ceil(gameRate / botRate);

        this.enemyPlayers = game.getPlayers().filter(p => p !== this.name && !game.areAlliedPlayers(this.name, p));

        this.knownMapBounds = determineMapBounds(game.mapApi);
        this.sectorCache = new SectorCache(game.mapApi, this.knownMapBounds);
        this.threatCache = undefined;

        this.logBotStatus(`Map bounds: ${this.knownMapBounds.x}, ${this.knownMapBounds.y}`);
    }

    private logBotStatus(message: string) {
        console.log(`[${this.name} - ${this.botState}] ${message}`);
    }

    private numBuildingsOwnedOfType(game: GameApi, rule: (r: TechnoRules) => boolean): number {
        return game.getVisibleUnits(this.name, "self", rule).length;
    }

    private updateBuildQueues(game: GameApi, playerData: PlayerData) {
        const queues = [QueueType.Structures, QueueType.Armory, QueueType.Infantry, QueueType.Vehicles, QueueType.Aircrafts, QueueType.Ships];
        const myCredits = playerData.credits;

        const decisions = queues.map(queueType => {
            const options = this.productionApi.getAvailableObjects(queueType);
            return {
                queue: queueType,
                decision: this.getBestOptionForBuilding(game, options, this.threatCache, false)
            };
        }).filter(decision => decision.decision != null);
        let totalWeightAcrossQueues = decisions.map(decision => decision.decision?.priority!).reduce((pV, cV) => (pV + cV), 0);
        let totalCostAcrossQueues = decisions.map(decision => decision.decision?.unit.cost!).reduce((pV, cV) => (pV + cV), 0);

        decisions.forEach(decision => {
            this.updateBuildQueue(game, decision.queue, decision.decision, totalWeightAcrossQueues, totalCostAcrossQueues, myCredits);
        });
    }

    private updateBuildQueue(
            game: GameApi, queueType: QueueType, decision: TechnoRulesWithPriority | undefined,
            totalWeightAcrossQueues: number, totalCostAcrossQueues: number, myCredits: number): void {
        let queueData = this.productionApi.getQueueData(queueType);
        if (queueData.status == QueueStatus.Idle) {
            // Start building the decided item.
            if (decision !== undefined) {
                this.logBotStatus(`Decided to build a ${decision.unit.name}`);
                this.actionsApi.queueForProduction(queueType, decision.unit.name, decision.unit.type, 1);
            }
        } else if (queueData.status == QueueStatus.Ready && queueData.items.length > 0) {
            // Consider placing it.
            const objectReady: TechnoRules = queueData.items[0].rules;
            if (queueType == QueueType.Structures || queueType == QueueType.Armory) {
                let location: {rx: number, ry: number} | undefined = this.getBestLocationForStructure(game, objectReady);
                if (location !== undefined) {
                    this.actionsApi.placeBuilding(objectReady.name, location.rx, location.ry);
                }
            }
        } else if (queueData.status == QueueStatus.Active && queueData.items.length > 0 && decision != null) {
            // Consider cancelling if something else is significantly higher priority.
            const playerStatus = this.gameApi.getPlayerData(this.name);
            const current = queueData.items[0].rules;
            const options = this.productionApi.getAvailableObjects(queueType);
            if (decision.unit != current) {
                // Changing our mind.
                let currentItemPriority = this.getPriorityForBuildingOption(current, this.gameApi, playerStatus, this.threatCache);
                let newItemPriority = decision.priority;
                if (newItemPriority > currentItemPriority * 2) {
                    this.logBotStatus(`Unqueueing ${current.name} because ${decision.unit.name} has 2x higher priority.`);
                    this.actionsApi.unqueueFromProduction(queueData.type, current.name, current.type, 1);
                }
            } else {
                // Not changing our mind, but maybe other queues are more important for now.
                if (totalCostAcrossQueues > myCredits && decision.priority < totalWeightAcrossQueues * 0.25) {
                    this.logBotStatus(`Pausing queue ${queueData.type} because weight is low (${decision.priority}/${totalWeightAcrossQueues})`);
                    this.actionsApi.pauseProduction(queueData.type);
                }
            }
        } else if (queueData.status == QueueStatus.OnHold) {
            // Consider resuming queue if priority is high relative to other queues.
            if (myCredits >= totalCostAcrossQueues) {
                this.logBotStatus(`Resuming queue ${queueData.type} because credits are high`);
                this.actionsApi.resumeProduction(queueData.type);
            } else if (decision && decision.priority >= totalWeightAcrossQueues * 0.25) {
                this.logBotStatus(`Resuming queue ${queueData.type} because weight is high (${decision.priority}/${totalWeightAcrossQueues})`);
                this.actionsApi.resumeProduction(queueData.type);
            }
        }
    }
    
    private getBestOptionForBuilding(game: GameApi, options: TechnoRules[], threatCache: GlobalThreat | undefined, debug: boolean = false): TechnoRulesWithPriority | undefined {
        const playerStatus = this.gameApi.getPlayerData(this.name);
        let priorityQueue: TechnoRulesWithPriority[] = [];
        options.forEach(option => {
            let priority = this.getPriorityForBuildingOption(option, game, playerStatus, threatCache);
            if (priority > 0) {
                priorityQueue.push({unit: option, priority: priority});
            }
        });

        priorityQueue = priorityQueue.sort((a, b) => {return a.priority - b.priority});
        if (priorityQueue.length > 0) {
            const lastItem = priorityQueue[priorityQueue.length-1];
            if (debug) {
                let queueString = priorityQueue.map(item => item.unit.name + "(" + item.priority + ")").join(", ");
                this.logBotStatus(`Build priority currently: ${queueString}`);
            }
        }

        return priorityQueue.pop();
    }

    private getPriorityForBuildingOption(option: TechnoRules, game: GameApi, playerStatus: PlayerData, threatCache: GlobalThreat | undefined) {
        if (buildingNameToAiBuildingRules.has(option.name)) {
            let logic = buildingNameToAiBuildingRules.get(option.name)!;
            return logic.getPriority(game, playerStatus, option, threatCache);
        } else {
            return defaultBuildingPriority - this.numBuildingsOwnedOfType(game, r => r == option);
        }
    }

    private getBestLocationForStructure(game: GameApi, objectReady: TechnoRules): {rx: number, ry: number} | undefined {
        const playerStatus = this.gameApi.getPlayerData(this.name);
        if (buildingNameToAiBuildingRules.has(objectReady.name)) {
            let logic = buildingNameToAiBuildingRules.get(objectReady.name)!;
            return logic.getPlacementLocation(game, playerStatus, objectReady);
        } else {
            // fallback placement logic
            return getDefaultPlacementLocation(game, playerStatus, playerStatus.startLocation, objectReady);
        }
    }

    override onGameTick(game: GameApi) {
        if (game.getCurrentTick() % this.tickRatio === 0) {
            const myPlayer = game.getPlayerData(this.name);
            const sectorsToUpdatePerCycle = 8; // TODO tune this
            this.sectorCache?.updateSectors(game.getCurrentTick(), sectorsToUpdatePerCycle, game.mapApi, myPlayer);
            let updateRatio = this.sectorCache?.getSectorUpdateRatio(game.getCurrentTick() - game.getTickRate() * 60);
            if (updateRatio && updateRatio < 1.0) {
                this.logBotStatus(`${updateRatio*100.0}% of sectors updated in last 60 seconds.`);
            }

            // Threat decays over time if we haven't killed anything
            let boredomFactor = 1.0 - Math.min(1.0, Math.max(0.0, (this.gameApi.getCurrentTick() - this.tickOfLastAttackOrder) / (1600.0)));
            let shouldAttack = (this.threatCache ? this.isWorthAttacking(this.threatCache, boredomFactor) : false);
            if (game.getCurrentTick() % (this.tickRatio * 150) == 0) {
                let visibility = this.sectorCache?.getOverallVisibility();
                if (visibility) {
                    this.logBotStatus(`${visibility*100.0}% of tiles visible. Calculating threat.`);
                    this.threatCache = calculateGlobalThreat(game, myPlayer, visibility);
                    this.logBotStatus(`Threat LAND: Them ${this.threatCache.totalOffensiveLandThreat}, us: ${this.threatCache.totalAvailableAntiGroundFirepower}.`);
                    this.logBotStatus(`Threat DEFENSIVE: Them ${this.threatCache.totalDefensiveThreat}, us: ${this.threatCache.totalDefensivePower}.`);
                    this.logBotStatus(`Threat AIR: Them ${this.threatCache.totalOffensiveAirThreat}, us: ${this.threatCache.totalAvailableAntiAirFirepower}.`);
                    this.logBotStatus(`Boredom: ${boredomFactor}`);
                }
            }
            if ((game.getCurrentTick() / game.getTickRate()) > 1000) { // 15 minutes
                this.logBotStatus(`Bored and quitting.`)
                this.botState = BotState.Defeated;
                this.actionsApi.quitGame();
            }
            
            // hacky resign condition
            const armyUnits = game.getVisibleUnits(this.name, "self", r => r.isSelectableCombatant);
            const productionBuildings = game.getVisibleUnits(this.name, "self", r => (r.type == ObjectType.Building && r.factory != FactoryType.None));
            if (armyUnits.length == 0 && productionBuildings.length == 0) {
                this.logBotStatus(`No army or production left, quitting.`)
                this.botState = BotState.Defeated;
                this.actionsApi.quitGame();
            }
            
            // Build logic.
            this.updateBuildQueues(game, myPlayer);

            // Mission logic.
            this.missionController.onAiUpdate(game, myPlayer, this.threatCache);

            // Squad logic.
            this.squadController.onAiUpdate(game, myPlayer, this.threatCache);




            switch (this.botState) {
                case BotState.Initial: {
                    const baseUnits = game.getGeneralRules().baseUnit;
                    let conYards = game.getVisibleUnits(this.name, "self", r => r.constructionYard);
                    if (conYards.length) {
                        this.botState = BotState.Deployed;
                        break;
                    }
                    const units = game.getVisibleUnits(this.name, "self", r => baseUnits.includes(r.name));
                    if (units.length) {
                        this.actionsApi.orderUnits([units[0]], OrderType.DeploySelected);
                    }
                    break;
                }

                case BotState.Deployed: {
                    /*const armyUnits = game.getVisibleUnits(this.name, "self", r => r.isSelectableCombatant);
                    const { x: rx, y: ry } = game.getPlayerData(this.enemyPlayers[0]).startLocation;
                    this.actionsApi.orderUnits(armyUnits, OrderType.AttackMove, rx, ry);*/
                    this.botState = BotState.Attacking;
                    break;
                }
                case BotState.Attacking: {
                    const armyUnits = game.getVisibleUnits(this.name, "self", r => r.isSelectableCombatant);
                    if (!shouldAttack) {
                        this.logBotStatus(`Not worth attacking, reverting to defence.`);
                        this.botState = BotState.Defending;
                    }
                    const enemyBuildings = game.getVisibleUnits(this.name, "hostile"); //r.constructionYard);
                    let foundTarget = false;
                    if (enemyBuildings.length) {
                        const weightedTargets = enemyBuildings
                            .filter(unit => this.isHostileUnit(game, unit))
                            .map(unitId => {
                                let unit = game.getUnitData(unitId);
                                return {
                                    unit,
                                    unitId: unitId,
                                    weight: getDistanceBetweenPoints(myPlayer.startLocation, {x: unit!.tile.rx, y: unit!.tile.rx})
                                }
                            })
                            .filter(unit => unit.unit != null);
                        weightedTargets.sort((targetA, targetB) => {
                            return targetA.weight - targetB.weight;
                        });
                        const target = weightedTargets.find(_ => true);
                        if (target !== undefined) {
                            let targetData = target.unit;
                            //this.logBotStatus(`It is time to attack: ${targetData?.name}`)
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
                    const armyUnits = game.getVisibleUnits(this.name, "self", r => (r.isSelectableCombatant));
                    const enemy = game.getPlayerData(this.enemyPlayers[0]);
                    const fallbackPoint = getPointTowardsOtherPoint(game, myPlayer.startLocation, enemy.startLocation, 10, 10, 0);

                    armyUnits.forEach(armyUnitId => {
                        let unit = game.getUnitData(armyUnitId);
                        if (unit && !unit.guardMode) {
                            let distanceToFallback = getDistanceBetweenPoints({x: unit.tile.rx, y: unit.tile.ry}, fallbackPoint);
                            if (distanceToFallback > 10) {
                                this.actionsApi.orderUnits([armyUnitId], OrderType.GuardArea, fallbackPoint.x, fallbackPoint.y);
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
                    const armyUnits = game.getVisibleUnits(this.name, "self", r => (r.isSelectableCombatant));
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

                    armyUnits.forEach(unitId => {
                        if (candidatePoints.length > 0) {
                            const unit = game.getUnitData(unitId);
                            if (unit?.isIdle) {
                                const scoutLocation = candidatePoints[Math.floor(Math.random() * candidatePoints.length)];
                                this.actionsApi.orderUnits([unitId], OrderType.AttackMove, scoutLocation.x, scoutLocation.y); 
                            }
                        }
                    });
                    const enemyBuildings = game.getVisibleUnits(this.name, "hostile").filter(unit => this.isHostileUnit(game, unit));
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

    private isWorthAttacking(threatCache: GlobalThreat, threatFactor: number) {
        //  * Math.sqrt(threatCache.certainty)
        let scaledGroundPower = Math.pow(threatCache.totalAvailableAntiGroundFirepower, 1.125);
        let scaledGroundThreat = (threatFactor * threatCache.totalOffensiveLandThreat + threatCache.totalDefensiveThreat) * 1.1;

        let scaledAirPower = Math.pow(threatCache.totalAvailableAirPower, 1.125);
        let scaledAirThreat = (threatFactor * threatCache.totalOffensiveAntiAirThreat + threatCache.totalDefensiveThreat) * 1.1;

        return (
            scaledGroundPower > scaledGroundThreat ||
            scaledAirPower > scaledAirThreat
        );
    }
    

    private isHostileUnit(game: GameApi, unitId: number) {
        const unitData = game.getUnitData(unitId);
        if (!unitData) {
            return false;
        }

        return (unitData.owner != this.name && game.getPlayerData(unitData.owner)?.isCombatant);
    }

    override onGameEvent(ev: ApiEvent) {
        switch (ev.type) {
            case ApiEventType.ObjectOwnerChange: {
                //this.logBotStatus(`Owner changea: ${ev.prevOwnerName} -> ${ev.newOwnerName}`);
                break;
            }

            case ApiEventType.ObjectDestroy: {
                //this.logBotStatus(`Object destroyed: ${ev.target}`);
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
