import { Bot } from "@chronodivide/game-api";
import { Countries } from "@supalosa/chronodivide-bot/dist/bot/logic/common/utils.js";

/* An empty bot implementation for performance testing */
export class DummyBot extends Bot {
    constructor(name: string, country: Countries) {
        super(name, country);
    }
}
