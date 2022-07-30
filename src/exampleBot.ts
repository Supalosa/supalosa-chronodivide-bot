import { cdapi } from "@chronodivide/game-api"
import { ExampleBot } from "./bot/bot.js";

async function main() {
    const mapName = "mp03t4.map";
    // Bot names must be unique in online mode
    const botName = `Joe${String(Date.now()).substr(-6)}`;
    const otherBotName = `Bob${String(Date.now() + 1).substr(-6)}`;

    await cdapi.init(process.env.MIX_DIR || "./");

    const game = await cdapi.createGame({
        // Uncomment the following lines to play in real time versus the bot
        // online: true,
        // serverUrl: process.env.SERVER_URL!,
        // clientUrl: process.env.CLIENT_URL!,
        // agents: [new ExampleBot(botName, "Americans"), { name: otherBotName, country: "French" }],
        agents: [new ExampleBot(botName, "Americans"), new ExampleBot(otherBotName, "French")],
        buildOffAlly: false,
        cratesAppear: false,
        credits: 10000,
        gameMode: cdapi.getAvailableGameModes(mapName)[0],
        gameSpeed: 6,
        mapName,
        mcvRepacks: true,
        shortGame: true,
        superWeapons: false,
        unitCount: 1
    });

    while (!game.isFinished()) {
        await game.update();
    }

    game.saveReplay();
    game.dispose();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
