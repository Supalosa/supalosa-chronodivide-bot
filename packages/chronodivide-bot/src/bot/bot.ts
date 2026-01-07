import { ApiEventType, Bot, GameApi, ApiEvent, ObjectType, FactoryType, Size } from "@chronodivide/game-api";

import { MissionController } from "./logic/mission/missionController.js";
import { QueueController } from "./logic/building/queueController.js";
import { MatchAwareness, MatchAwarenessImpl } from "./logic/awareness.js";
import { Countries, formatTimeDuration } from "./logic/common/utils.js";
import { IncrementalGridCache } from "./logic/map/incrementalGridCache.js";
import { SupabotContext } from "./logic/common/context.js";

const DEBUG_STATE_UPDATE_INTERVAL_SECONDS = 6;

const DEBUG_MESSAGES_BUFFER_LENGTH = 20;

// Number of ticks per second at the base speed.
const NATURAL_TICK_RATE = 15;

export class SupalosaBot extends Bot {
    private tickRatio?: number;
    private missionController: MissionController;
    private queueController: QueueController;
    private tickOfLastAttackOrder: number = 0;

    private matchAwareness: MatchAwareness | null = null;

    // Messages to display in visualisation mode only.
    public _debugMessages: string[] = [];
    public _globalDebugText: string = "";
    public _debugGridCaches: {grid: IncrementalGridCache<any>, tag: string}[] = [];

    constructor(
        name: string,
        country: Countries,
        private tryAllyWith: string[] = [],
        private enableLogging = true,
    ) {
        super(name, country);
        this.missionController = new MissionController((message, sayInGame) => this.logBotStatus(message, sayInGame));
        this.queueController = new QueueController();
    }

    override onGameStart(game: GameApi) {
        const gameRate = game.getTickRate();
        const botApm = 300;
        const botRate = botApm / 60;
        this.tickRatio = Math.ceil(gameRate / botRate);

        const myPlayer = game.getPlayerData(this.name);        

        this.matchAwareness = new MatchAwarenessImpl(
            game,
            myPlayer,
            null,
            myPlayer.startLocation,
            (message, sayInGame) => this.logBotStatus(message, sayInGame),
        );

        this._debugGridCaches = [
            {grid: this.matchAwareness.getSectorCache(), tag: "sector-cache"},
            {grid: this.matchAwareness.getBuildSpaceCache()._cache, tag: "build-cache"}
        ];

        this.matchAwareness.onGameStart(game, myPlayer);

        this.tryAllyWith
            .filter((playerName) => playerName !== this.name)
            .forEach((playerName) => this.actionsApi.toggleAlliance(playerName, true));
    }

    override onGameTick(game: GameApi) {
        if (!this.matchAwareness) {
            return;
        }

        const threatCache = this.matchAwareness.getThreatCache();

        if ((game.getCurrentTick() / NATURAL_TICK_RATE) % DEBUG_STATE_UPDATE_INTERVAL_SECONDS === 0) {
            this.updateDebugState(game);
        }

        if (game.getCurrentTick() % this.tickRatio! === 0) {
            const myPlayer = game.getPlayerData(this.name);

            this.matchAwareness.onAiUpdate(this.context);

            const fullContext: SupabotContext = {
                ...this.context,
                matchAwareness: this.matchAwareness,
            };

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
                this.context.player.actions.quitGame();
            }

            // Mission logic every 3 ticks
            if (this.context.game.getCurrentTick() % 3 === 0) {
                this.missionController.onAiUpdate(fullContext);
            }

            const unitTypeRequests = this.missionController.getRequestedUnitTypes();

            // Build logic.
            this.queueController.onAiUpdate(
                game,
                this.productionApi,
                this.actionsApi,
                myPlayer,
                threatCache,
                unitTypeRequests,
                (message) => this.logBotStatus(message),
            );
        }
    }

    private getHumanTimestamp(game: GameApi) {
        return formatTimeDuration(game.getCurrentTick() / NATURAL_TICK_RATE);
    }

    private logBotStatus(message: string, sayInGame: boolean = false) {
        if (!this.enableLogging) {
            return;
        }
        this.logger.info(message);
        const timestamp = this.getHumanTimestamp(this.gameApi);
        if (sayInGame) {
            this.actionsApi.sayAll(`${timestamp}: ${message}`);
        }
        this.pushDebugMessage(`${timestamp}: ${message}`);
    }

    private updateDebugState(game: GameApi) {
        if (!this.getDebugMode()) {
            return;
        }
        // Update the global debug text.
        const myPlayer = game.getPlayerData(this.name);
        const harvesters = game.getVisibleUnits(this.name, "self", (r) => r.harvester).length;

        let globalDebugText = `Cash: ${myPlayer.credits} | Harvesters: ${harvesters}\n`;
        globalDebugText += this.queueController.getGlobalDebugText(this.gameApi, this.productionApi);
        globalDebugText += this.missionController.getGlobalDebugText(this.gameApi);
        globalDebugText += this.matchAwareness?.getGlobalDebugText();

        this.missionController.updateDebugText(this.actionsApi);

        // Tag enemy units with IDs
        game.getVisibleUnits(this.name, "enemy").forEach((unitId) => {
            this.actionsApi.setUnitDebugText(unitId, unitId.toString());
        });

        this.actionsApi.setGlobalDebugText(globalDebugText);
        this._globalDebugText = globalDebugText;
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

    protected pushDebugMessage(message: string) {
        if (this._debugMessages.length + 1 > DEBUG_MESSAGES_BUFFER_LENGTH) {
            this._debugMessages.shift();
        }
        this._debugMessages.push(message);
    }
}
