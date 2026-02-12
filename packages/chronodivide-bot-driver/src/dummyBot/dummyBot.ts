import { Bot, GameApi } from "@chronodivide/game-api";
import { Countries } from "@supalosa/chronodivide-bot/dist/bot/logic/common/utils.js";

/* An empty bot implementation for performance/unit testing. Includes testing methods to display the game state. */
export class DummyBot extends Bot {
    public lastGameApi: GameApi | null = null;

    constructor(name: string, country: Countries) {
        super(name, country);
    }

    onGameTick() {
        this.lastGameApi = this.game;
    }
}
