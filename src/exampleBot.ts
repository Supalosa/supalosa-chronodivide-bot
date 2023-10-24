import { Agent, Bot, cdapi } from "@chronodivide/game-api";
import { SupalosaBot } from "./bot/bot.js";

async function main() {
    /*
    Ladder maps:
    CDR2            1v1             2_malibu_cliffs_le.map
    CDR2            1v1             4_country_swing_le_v2.map
    CDR2            1v1             mp01t4.map
    CDR2            1v1             tn04t2.map small map
    CDR2            1v1             mp10s4.map <- depth charge, naval map only
    CDR2            1v1             heckcorners.map
    CDR2            1v1             4_montana_dmz_le.map
    CDR2            1v1             barrel.map
    
    Other maps:
    mp03t4
    */
    const mapName = "mp03t4.map";
    // Bot names must be unique in online mode
    const botName = `Joe${String(Date.now()).substr(-6)}`;
    const otherBotName = `Bob${String(Date.now() + 1).substr(-6)}`;

    await cdapi.init(process.env.MIX_DIR || "./");

    console.log("Server URL: " + process.env.SERVER_URL!);
    console.log("Client URL: " + process.env.CLIENT_URL!);

    /*
    Countries:
    0=Americans
    1=Alliance -> Korea
    2=French
    3=Germans
    4=British

    5=Africans -> Libya
    6=Arabs -> Iraq
    7=Confederation -> Cuba
    8=Russians
    */

    const onlineSettings = {
        online: true as true,
        serverUrl: process.env.SERVER_URL!,
        clientUrl: process.env.CLIENT_URL!,
        agents: [new SupalosaBot(botName, "Americans"), { name: otherBotName, country: "French" }] as [Bot, ...Agent[]],
    };

    const offlineSettings = {
        agents: [new SupalosaBot(botName, "French", false), new SupalosaBot(otherBotName, "French", true)],
    };

    const game = await cdapi.createGame({
        ...offlineSettings,
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
