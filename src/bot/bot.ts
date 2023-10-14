import {
    OrderType,
    ApiEventType,
    Bot,
    GameApi,
    ApiEvent,
    QueueStatus,
    Point2D,
    ObjectType,
    FactoryType,
} from "@chronodivide/game-api";

import { Duration } from "luxon";

import { determineMapBounds, getDistanceBetweenPoints, getPointTowardsOtherPoint } from "./logic/map/map.js";
import { SectorCache } from "./logic/map/sector.js";
import { MissionController } from "./logic/mission/missionController.js";
import { SquadController } from "./logic/squad/squadController.js";
import { GlobalThreat } from "./logic/threat/threat.js";
import { calculateGlobalThreat } from "./logic/threat/threatCalculator.js";
import { QUEUES, QueueController, queueTypeToName } from "./logic/building/queueController.js";
import { ExpansionMission } from "./logic/mission/missions/expansionMission.js";
import { ScoutingMission } from "./logic/mission/missions/scoutingMission.js";
import { MatchAwareness as MatchAwareness } from "./logic/awareness.js";
import { DefenceMission } from "./logic/mission/missions/defenceMission.js";
import { AttackFailReason, AttackMission, GeneralAttack as GENERAL_ATTACK } from "./logic/mission/missions/attackMission.js";

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
const BOT_AUTO_SURRENDER_TIME_SECONDS = 3600; // 7200; // 2 hours (approx 30 mins in real game)

const RALLY_POINT_UPDATE_INTERVAL_TICKS = 60;

export class SupalosaBot extends Bot {
    private botState = BotState.Initial;
    private tickRatio!: number;
    private enemyPlayers!: string[];
    private knownMapBounds: Point2D | undefined;
    private missionController: MissionController;
    private squadController: SquadController;
    private queueController: QueueController;
    private tickOfLastAttackOrder: number = 0;

    private matchAwareness: MatchAwareness | null = null;

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

        this.matchAwareness = {
            threatCache: null,
            sectorCache: new SectorCache(game.mapApi, this.knownMapBounds),
            mainRallyPoint: game.getPlayerData(this.name).startLocation,
        };

        this.logBotStatus(`Map bounds: ${this.knownMapBounds.x}, ${this.knownMapBounds.y}`);
    }

    override onGameTick(game: GameApi) {
        if (!this.matchAwareness) {
            return;
        }

        const { sectorCache, mainRallyPoint } = this.matchAwareness;
        let { threatCache } = this.matchAwareness;

        if ((game.getCurrentTick() / NATURAL_TICK_RATE) % DEBUG_TIMESTAMP_OUTPUT_INTERVAL_SECONDS === 0) {
            this.logDebugState(game);
        }
        if (game.getCurrentTick() % this.tickRatio === 0) {
            const myPlayer = game.getPlayerData(this.name);
            const sectorsToUpdatePerCycle = 8; // TODO tune this
            sectorCache.updateSectors(game.getCurrentTick(), sectorsToUpdatePerCycle, game.mapApi, myPlayer);
            let updateRatio = sectorCache?.getSectorUpdateRatio(game.getCurrentTick() - game.getTickRate() * 60);
            if (updateRatio && updateRatio < 1.0) {
                this.logBotStatus(`${updateRatio * 100.0}% of sectors updated in last 60 seconds.`);
            }

            // Threat decays over time if we haven't killed anything
            let boredomFactor =
                1.0 -
                Math.min(1.0, Math.max(0.0, (this.gameApi.getCurrentTick() - this.tickOfLastAttackOrder) / 1600.0));
            let shouldAttack = !!threatCache ? this.isWorthAttacking(threatCache, boredomFactor) : false;
            if (game.getCurrentTick() % (this.tickRatio * 150) == 0) {
                let visibility = this.matchAwareness.sectorCache?.getOverallVisibility();
                if (visibility) {
                    this.logBotStatus(`${Math.round(visibility * 1000.0) / 10}% of tiles visible. Calculating threat.`);
                    // Update the global threat cache
                    threatCache = this.matchAwareness.threatCache = calculateGlobalThreat(game, myPlayer, visibility);
                    this.logBotStatus(
                        `Threat LAND: Them ${Math.round(
                            this.matchAwareness?.threatCache.totalOffensiveLandThreat
                        )}, us: ${Math.round(threatCache.totalAvailableAntiGroundFirepower)}.`
                    );
                    this.logBotStatus(
                        `Threat DEFENSIVE: Them ${Math.round(threatCache.totalDefensiveThreat)}, us: ${Math.round(
                            threatCache.totalDefensivePower
                        )}.`
                    );
                    this.logBotStatus(
                        `Threat AIR: Them ${Math.round(threatCache.totalOffensiveAirThreat)}, us: ${Math.round(
                            threatCache.totalAvailableAntiAirFirepower
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
                threatCache,
                (message) => this.logBotStatus(message)
            );

            // Mission logic.
            this.missionController.onAiUpdate(game, myPlayer, this.matchAwareness, this.squadController);

            // Squad logic.
            this.squadController.onAiUpdate(game, this.actionsApi, myPlayer, this.matchAwareness, (message) =>
                this.logBotStatus(message)
            );

            // Update rally point every few ticks.
            if (game.getCurrentTick() % RALLY_POINT_UPDATE_INTERVAL_TICKS === 0) {
                const enemy = game.getPlayerData(this.enemyPlayers[0]);
                this.matchAwareness.mainRallyPoint = getPointTowardsOtherPoint(
                    game,
                    myPlayer.startLocation,
                    enemy.startLocation,
                    10,
                    10,
                    0
                );
            }

            // Dispatch missions.

            // TODO: remove this switch.
            switch (this.botState) {
                case BotState.Initial: {
                    let conYards = game.getVisibleUnits(this.name, "self", (r) => r.constructionYard);
                    if (conYards.length) {
                        this.botState = BotState.Deployed;
                        break;
                    }
                    break;
                }
                case BotState.Deployed: {
                    this.botState = BotState.Scouting;
                    break;
                }
                case BotState.Attacking: {
                    if (!shouldAttack) {
                        this.logBotStatus(`Not worth attacking, reverting to defence.`);
                        this.missionController.disbandMission("globalAttack");
                        this.botState = BotState.Defending;
                    } else {
                        const attackRadius = 15;
                        this.missionController.addMission(
                            new AttackMission("globalAttack", 100, mainRallyPoint, GENERAL_ATTACK, attackRadius)
                        )?.then((reason, squad) => {
                            this.logBotStatus(`Attack ended, reason ${reason} ${squad?.getName()}`)
                            if (squad) {
                                const units = squad.getUnits(game).map((unit) => unit.id);
                                this.actionsApi.orderUnits(units, OrderType.Move, mainRallyPoint.x, mainRallyPoint.y);
                            }
                            if (reason === AttackFailReason.NoTargets) {
                                this.botState = BotState.Scouting;
                            } else {
                                this.botState = BotState.Defending;
                            }
                        });
                    }
                    break;
                }
                case BotState.Defending: {
                    // hacky, improve this
                    const defenceRadius = 15;
                    this.missionController.addMission(
                        new DefenceMission("globalDefence", 100, mainRallyPoint, defenceRadius)
                    );
                    if (shouldAttack) {
                        this.logBotStatus(`Finished defending, ready to attack.`);
                        this.botState = BotState.Attacking;
                    }
                    break;
                }
                case BotState.Scouting: {
                    this.missionController.addMission(new ScoutingMission("globalScout", 100));
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
