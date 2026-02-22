import { describe, it, expect, beforeAll } from "vitest";
import { CreateOfflineOpts, cdapi } from "@chronodivide/game-api";
import { SupalosaBot } from "@supalosa/chronodivide-bot/dist/bot/bot.js";
import { Countries } from "@supalosa/chronodivide-bot/dist/bot/logic/common/utils.js";
import { DummyBot } from "../dummyBot/dummyBot.js";

// These tests are quite expensive - limit them to simple setups only (1v1s, dummy enemy etc)
describe.concurrent("Full Match", () => {
    it("should defeat DummyBot on a basic map", async () => {
        await cdapi.init("./data");
        const mapName = "simple-1v1-no-preview.map";
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
                new DummyBot(botName2, Countries.RUSSIA),
            ],
        };

        const game = await cdapi.createGame(gameSettings);

        expect(game).toBeDefined();
        expect(game.isFinished()).toBe(false);

        // Typically takes ~3500 ticks to win
        const maxTicks = 6000;
        let tickCount = 0;

        while (!game.isFinished() && tickCount < maxTicks) {
            await game.update();
            tickCount++;
        }

        expect(tickCount).toBeGreaterThan(0);
        expect(game.isFinished()).toBe(true);

        game.dispose();
    }, 30000);

    // TODO: naval logic not currently implemented
    it.todo(
        "should defeat DummyBot on a water map",
        async () => {
            await cdapi.init("./data");
            const mapName = "water-1v1-no-preview.map";
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
                    new DummyBot(botName2, Countries.RUSSIA),
                ],
            };

            const game = await cdapi.createGame(gameSettings);

            expect(game).toBeDefined();
            expect(game.isFinished()).toBe(false);

            // Typically takes ~3500 ticks to win
            const maxTicks = 6000;
            let tickCount = 0;

            while (!game.isFinished() && tickCount < maxTicks) {
                await game.update();
                tickCount++;
            }

            expect(tickCount).toBeGreaterThan(0);
            expect(game.isFinished()).toBe(true);

            game.dispose();
        },
        30000,
    );
});
