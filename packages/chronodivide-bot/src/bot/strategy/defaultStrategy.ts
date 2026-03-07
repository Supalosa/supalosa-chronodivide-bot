import { Strategy } from "./strategy.js";
import { ExpansionMissionFactory } from "../logic/mission/missions/expansionMission.js";
import { ScoutingMissionFactory } from "../logic/mission/missions/scoutingMission.js";
import { AttackMissionFactory } from "../logic/mission/missions/attackMission.js";
import { DefenceMissionFactory } from "../logic/mission/missions/defenceMission.js";
import { EngineerMissionFactory } from "../logic/mission/missions/engineerMission.js";
import { SupabotContext } from "../logic/common/context.js";
import { MissionController } from "../logic/mission/missionController.js";
import { DebugLogger } from "../logic/common/utils.js";
import { Compositions, getValidCompositions, SideComposition } from "./compositionUtils.js";

// These could be loaded from ai.ini
const DEFAULT_COMPOSITIONS: Compositions = {
    conscripts: {
        composition: {
            E2: 1,
        },
        minimumUnits: 5,
        maximumUnits: 10,
    },
    gis: {
        composition: {
            E1: 1,
        },
        minimumUnits: 5,
        maximumUnits: 10,
    },
    sovietTanks: {
        composition: {
            HTNK: 5,
            HTK: 1,
        },
        minimumUnits: 4,
        maximumUnits: 20,
    },
    alliedTanks: {
        composition: {
            MTNK: 5,
            FV: 1,
        },
        minimumUnits: 4,
        maximumUnits: 20,
    },
    kirovs: {
        composition: {
            KIROV: 1,
        },
        minimumUnits: 1,
        maximumUnits: 3,
    },
    rocketeers: {
        composition: {
            JUMPJET: 1,
        },
        minimumUnits: 3,
        maximumUnits: 6,
    },
};

export class DefaultStrategy implements Strategy {
    private expansionFactory = new ExpansionMissionFactory();
    private scoutingFactory = new ScoutingMissionFactory();
    private attackFactory = new AttackMissionFactory();
    private defenceFactory = new DefenceMissionFactory();
    private engineerFactory = new EngineerMissionFactory();

    constructor() {}

    onAiUpdate(context: SupabotContext, missionController: MissionController, logger: DebugLogger) {
        this.expansionFactory.maybeCreateMissions(context, missionController, logger);
        this.scoutingFactory.maybeCreateMissions(context, missionController, logger);

        const composition = this.selectRandomAttackComposition(context);
        if (composition) {
            this.attackFactory.maybeCreateMissions(context, missionController, logger, composition);
        }

        this.defenceFactory.maybeCreateMissions(context, missionController, logger);
        this.engineerFactory.maybeCreateMissions(context, missionController, logger);

        return this;
    }

    selectRandomAttackComposition(context: SupabotContext): SideComposition | null {
        const playerData = context.game.getPlayerData(context.player.name);
        const side = playerData.country?.side;
        if (side === undefined) {
            return null;
        }

        const validCompositions = getValidCompositions(context, DEFAULT_COMPOSITIONS);

        if (validCompositions.length === 0) {
            return null;
        }

        const randomIndex = context.game.generateRandomInt(0, validCompositions.length - 1);
        const compositionId = validCompositions[randomIndex];
        return DEFAULT_COMPOSITIONS[compositionId];
    }
}
