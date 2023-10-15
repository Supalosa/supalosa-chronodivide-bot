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

import { determineMapBounds } from "./logic/map/map.js";
import { SectorCache } from "./logic/map/sector.js";
import { MissionController } from "./logic/mission/missionController.js";
import { SquadController } from "./logic/squad/squadController.js";
import { QUEUES, QueueController, queueTypeToName } from "./logic/building/queueController.js";
import { MatchAwareness as MatchAwareness, MatchAwarenessImpl } from "./logic/awareness.js";

const DEBUG_TIMESTAMP_OUTPUT_INTERVAL_SECONDS = 60;
const NATURAL_TICK_RATE = 15;
const BOT_AUTO_SURRENDER_TIME_SECONDS = 7200; // 7200; // 2 hours (approx 30 mins in real game)

export class SupalosaBot extends Bot {
    private tickRatio!: number;
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

        this.knownMapBounds = determineMapBounds(game.mapApi);

        this.matchAwareness = new MatchAwarenessImpl(
            null,
            new SectorCache(game.mapApi, this.knownMapBounds),
            game.getPlayerData(this.name).startLocation,
            this.logBotStatus,
        );

        this.logBotStatus(`Map bounds: ${this.knownMapBounds.x}, ${this.knownMapBounds.y}`);
    }

    override onGameTick(game: GameApi) {
        if (!this.matchAwareness) {
            return;
        }

        const threatCache = this.matchAwareness.getThreatCache();

        if ((game.getCurrentTick() / NATURAL_TICK_RATE) % DEBUG_TIMESTAMP_OUTPUT_INTERVAL_SECONDS === 0) {
            this.logDebugState(game);
        }

        if (game.getCurrentTick() % this.tickRatio === 0) {
            const myPlayer = game.getPlayerData(this.name);

            this.matchAwareness.onAiUpdate(game, myPlayer);

            if (game.getCurrentTick() / NATURAL_TICK_RATE > BOT_AUTO_SURRENDER_TIME_SECONDS) {
                this.logBotStatus(`Auto-surrendering after ${BOT_AUTO_SURRENDER_TIME_SECONDS} seconds.`);
                this.actionsApi.quitGame();
            }

            // hacky resign condition
            const armyUnits = game.getVisibleUnits(this.name, "self", (r) => r.isSelectableCombatant);
            const mcvUnits = game.getVisibleUnits(
                this.name,
                "self",
                (r) => !!r.deploysInto && game.getGeneralRules().baseUnit.includes(r.name),
            );
            const productionBuildings = game.getVisibleUnits(
                this.name,
                "self",
                (r) => r.type == ObjectType.Building && r.factory != FactoryType.None,
            );
            if (armyUnits.length == 0 && productionBuildings.length == 0 && mcvUnits.length == 0) {
                this.logBotStatus(`No army or production left, quitting.`);
                this.actionsApi.quitGame();
            }

            // Build logic.
            this.queueController.onAiUpdate(
                game,
                this.productionApi,
                this.actionsApi,
                myPlayer,
                threatCache,
                (message) => this.logBotStatus(message),
            );

            // Mission logic every 6 ticks
            if (this.gameApi.getCurrentTick() % 6 === 0) {
                this.missionController.onAiUpdate(game, myPlayer, this.matchAwareness, this.squadController);
            }

            // Squad logic every 3 ticks
            if (this.gameApi.getCurrentTick() % 3 === 0) {
                this.squadController.onAiUpdate(game, this.actionsApi, myPlayer, this.matchAwareness, (message) =>
                    this.logBotStatus(message),
                );
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
        console.log(`[${this.getHumanTimestamp(this.gameApi)} ${this.name}] ${message}`);
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
        this.missionController.logDebugOutput();
        this.actionsApi.sayAll(`Cash: ${myPlayer.credits}`);
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
