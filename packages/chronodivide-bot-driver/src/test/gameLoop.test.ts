import { describe, it, expect, beforeAll } from 'vitest';
import { CreateOfflineOpts, cdapi } from "@chronodivide/game-api";
import { SupalosaBot } from "@supalosa/chronodivide-bot/dist/bot/bot.js";
import { Countries } from "@supalosa/chronodivide-bot/dist/bot/logic/common/utils.js";

describe('Game Loop', () => {
    beforeAll(async () => {
        await cdapi.init("./data");
    });

    it('should initialize and run a basic game', async () => {
        const mapName = "mp06t2.map";
        const timestamp = String(Date.now()).substr(-6);
        const botName1 = `TestBot1_${timestamp}`;
        const botName2 = `TestBot2_${timestamp}`;

        const gameSettings: CreateOfflineOpts = {
            buildOffAlly: false,
            cratesAppear: false,
            credits: 10000,
            gameMode: cdapi.getAvailableGameModes(mapName)[0],
            gameSpeed: 6,
            mapName,
            mcvRepacks: true,
            shortGame: true,
            superWeapons: false,
            unitCount: 0,
            online: false,
            agents: [
                new SupalosaBot(botName1, Countries.FRANCE, [botName2], true),
                new SupalosaBot(botName2, Countries.RUSSIA, [botName1], false),
            ],
        };

        const game = await cdapi.createGame(gameSettings);
        
        expect(game).toBeDefined();
        expect(game.isFinished()).toBe(false);

        // Run for 100 ticks (~6.67 seconds in-game time at 15 ticks/second)
        const maxTicks = 100;
        let tickCount = 0;

        while (!game.isFinished() && tickCount < maxTicks) {
            await game.update();
            tickCount++;
        }

        expect(tickCount).toBeGreaterThan(0);
        expect(game.getCurrentTick()).toBeGreaterThanOrEqual(tickCount);

        game.dispose();
    }, 30000); // 30 second timeout for game initialization and execution
});
