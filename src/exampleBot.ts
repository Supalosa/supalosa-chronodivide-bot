import { cdapi } from "@chronodivide/game-api";
import { SupalosaBot } from "./bot/bot.js";

async function main() {
    const mapName = "mp03t4.map";
    // Bot names must be unique in online mode
    const botName = `Joe${String(Date.now()).substr(-6)}`;
    const otherBotName = `Bob${String(Date.now() + 1).substr(-6)}`;

    await cdapi.init(process.env.MIX_DIR || "./");

    console.log("Server URL: " + process.env.SERVER_URL!);
    console.log("Client URL: " + process.env.CLIENT_URL!);

    const game = await cdapi.createGame({
        // Uncomment the following lines to play in real time versus the bot
        /*online: true,
        serverUrl: process.env.SERVER_URL!,
        clientUrl: process.env.CLIENT_URL!,
        agents: [new SupalosaBot(botName, "Americans"), { name: otherBotName, country: "French" }],*/
        agents: [new SupalosaBot(botName, "Russians", false), new SupalosaBot(otherBotName, "Americans", true)],
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
    });
    while (!game.isFinished()) {
        await game.update();
    }

    game.saveReplay();
    game.dispose();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
