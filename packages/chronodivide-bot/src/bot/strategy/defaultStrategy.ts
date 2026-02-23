import { GameApi, PlayerData, SideType } from "@chronodivide/game-api";
import { Strategy } from "./strategy.js";
import { UnitComposition } from "../logic/composition/common.js";
import { MatchAwareness } from "../logic/awareness.js";
import { ExpansionMissionFactory } from "../logic/mission/missions/expansionMission.js";
import { ScoutingMissionFactory } from "../logic/mission/missions/scoutingMission.js";
import { AttackMissionFactory } from "../logic/mission/missions/attackMission.js";
import { DefenceMissionFactory } from "../logic/mission/missions/defenceMission.js";
import { EngineerMissionFactory } from "../logic/mission/missions/engineerMission.js";
import { SupabotContext } from "../logic/common/context.js";
import { MissionController } from "../logic/mission/missionController.js";
import { DebugLogger } from "../logic/common/utils.js";

export class DefaultStrategy implements Strategy {
    private expansionFactory = new ExpansionMissionFactory();
    private scoutingFactory = new ScoutingMissionFactory();
    private attackFactory = new AttackMissionFactory();
    private defenceFactory = new DefenceMissionFactory();
    private engineerFactory = new EngineerMissionFactory();

    maybeCreateMissions(context: SupabotContext, missionController: MissionController, logger: DebugLogger): void {
        this.expansionFactory.maybeCreateMissions(context, missionController, logger);
        this.scoutingFactory.maybeCreateMissions(context, missionController, logger);

        const playerData = context.game.getPlayerData(context.player.name);
        const composition = this.getAttackUnitComposition(context.game, playerData);
        this.attackFactory.maybeCreateMissions(context, missionController, logger, composition);

        this.defenceFactory.maybeCreateMissions(context, missionController, logger);
        this.engineerFactory.maybeCreateMissions(context, missionController, logger);
    }

    getAttackUnitComposition(gameApi: GameApi, playerData: PlayerData): UnitComposition {
        const side = gameApi.getPlayerData(playerData.name).country?.side;
        if (side === SideType.Nod) {
            const hasWarFactory =
                gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "NAWEAP").length > 0;
            const hasRadar = gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "NARADR").length > 0;
            const hasBattleLab =
                gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "NATECH").length > 0;

            const includeInfantry = !hasBattleLab;
            return {
                ...(includeInfantry && { E2: 10 }),
                ...(hasWarFactory && { HTNK: 3, HTK: 2 }),
                ...(hasRadar && { V3: 1 }),
                ...(hasBattleLab && { APOC: 2 }),
            };
        } else if (side === SideType.GDI) {
            const hasWarFactory =
                gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GAWEAP").length > 0;
            const hasAirforce =
                gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GAAIRC" || r.name === "AMRADR")
                    .length > 0;
            const hasBattleLab =
                gameApi.getVisibleUnits(playerData.name, "self", (r) => r.name === "GATECH").length > 0;

            const includeInfantry = !hasAirforce && !hasBattleLab;
            return {
                ...(includeInfantry && { E1: 5 }),
                ...(hasWarFactory && { MTNK: 3, FV: 2 }),
                ...(hasAirforce && { JUMPJET: 6 }),
                ...(hasBattleLab && { SREF: 2, MGTK: 3 }),
            };
        } else {
            throw new Error(`Unknown side type ${side} (country: ${playerData.country?.name})`);
        }
    }
}
