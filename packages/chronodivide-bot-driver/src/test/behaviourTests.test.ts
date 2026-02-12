import { describe, it, expect, beforeEach } from 'vitest';
import { CreateOfflineOpts, cdapi } from "@chronodivide/game-api";
import { SupalosaBot } from "@supalosa/chronodivide-bot/dist/bot/bot.js";
import { Countries } from "@supalosa/chronodivide-bot/dist/bot/logic/common/utils.js";
import { DummyBot } from "../dummyBot/dummyBot.js";

describe.concurrent("Behaviour tests", () => {
    beforeEach(async () => {
        await cdapi.init("./data");
    });

    it("should deploy MCV at start of game", async () => {
        const mapName = "simple-1v1-no-preview.map";
        const timestamp = String(Date.now()).substr(-6);
        const botName1 = `TestBot1_${timestamp}`;
        const botName2 = `TestBot2_${timestamp}`;
        const dummy = new DummyBot(botName2, Countries.RUSSIA);

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
                dummy
            ],
        };

        const game = await cdapi.createGame(gameSettings);

        expect(game).toBeDefined();
        expect(game.isFinished()).toBe(false);

        // Takes about 60 ticks to first deploy
        const maxTicks = 100;
        let tickCount = 0;
        let foundConyard = false;

        while (!game.isFinished() && tickCount < maxTicks && !foundConyard) {
            await game.update();
            tickCount++;
            const conYards = dummy.lastGameApi!.getAllUnits(r => r.constructionYard);
            const botConyard = conYards.map((id) => dummy.lastGameApi!.getUnitData(id)).find(u => !!u && u.owner === botName1);
            foundConyard = !!botConyard;
        }
        
        expect(foundConyard).toBe(true);


        game.dispose();
    }, 30000);
});
