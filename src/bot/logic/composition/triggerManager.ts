// Interpreter and state management for ai.ini TriggerTypes

import { GameApi, IniFile, PlayerData, SideType } from "@chronodivide/game-api";
import { Countries } from "../common/utils.js";
import { Side } from "three";
import { BotDifficulty } from "../../bot.js";

enum OwnerHouse {
    None = "<none>",
    All = "<all>",
}

enum AiSideType {
    All = 0,
    Allied = 1,
    Soviet = 2,
}

enum ConditionType {
    AlwaysTrue = -1,
    EnemyHouseOwns = 0,
    OwningHouseOwns = 1,
    EnemyHouseInYellowPower = 2,
    EnemyHouseInRedPower = 3,
    EnemyHouseHasCredits = 4, // cannot implement
    OwnerHasIronCurtainReady = 5, // see [General].AIMinorSuperReadyPercent
    OwnerHasChronoSphereReady = 6,
    NeutralHouseOwns = 7,
}

type ConditionEvaluator = (comparisonObject: string, comparator: string) => boolean;

const conditionEvaluators: Map<ConditionType, ConditionEvaluator> = new Map([
    [ConditionType.AlwaysTrue, () => true],
    [ConditionType.EnemyHouseOwns, () => true],
]);

enum ComparatorOperator {
    LessThan = 0,
    LessThanOrEqual = 1,
    Equal = 2,
    GreaterThanOrEqual = 3,
    GreaterThan = 4,
    NotEqual = 5,
}

// https://modenc.renegadeprojects.com/AITriggerTypes
class AITriggerType {
    public readonly name: string;
    public readonly teamType: string;
    public readonly ownerHouse: OwnerHouse | Countries;
    public readonly techLevel: number; // Not implemented
    public readonly conditionType: ConditionType;
    public readonly comparisonObject: string;
    public readonly comparator: string;
    public readonly startingWeight: number;
    public readonly minimumWeight: number;
    public readonly maximumWeight: number;
    public readonly isForSkirmish: boolean; // Not implemented, assumed true
    public readonly side: AiSideType;
    public readonly otherTeamType: string;
    public readonly enabledInEasy: boolean;
    public readonly enabledInMedium: boolean;
    public readonly enabledInHard: boolean;

    public readonly comparatorArgument: number;
    public readonly comparatorOperator: number;

    constructor(
        public readonly id: string,
        value: string,
    ) {
        const values = value.split(",");
        this.name = values[0];
        this.teamType = values[1];
        this.ownerHouse = this.parseOwnerHouse(values[2]);
        this.techLevel = parseInt(values[3]);
        this.conditionType = parseInt(values[4]);
        this.comparisonObject = values[5];
        this.comparator = values[6];
        this.startingWeight = parseFloat(values[7]);
        this.minimumWeight = parseFloat(values[8]);
        this.maximumWeight = parseFloat(values[9]);
        this.isForSkirmish = this.parseBoolean(values[10]);
        // 11 is unused
        this.side = parseInt(values[12]);
        // 13 is unused (IsBaseDefence)
        this.otherTeamType = values[14];
        this.enabledInEasy = this.parseBoolean(values[15]);
        this.enabledInMedium = this.parseBoolean(values[16]);
        this.enabledInHard = this.parseBoolean(values[17]);

        const reversedComparator = this.comparator.split("").reverse().join("");
        this.comparatorArgument = parseInt(
            reversedComparator.slice(reversedComparator.length - 8, reversedComparator.length),
            16,
        );
        this.comparatorOperator = parseInt(
            reversedComparator.slice(reversedComparator.length - 16, reversedComparator.length - 8),
            16,
        );
    }

    private parseOwnerHouse(val: string): OwnerHouse | Countries {
        if (val === OwnerHouse.None) {
            return OwnerHouse.None;
        } else if (val === OwnerHouse.All) {
            return OwnerHouse.All;
        } else if (Object.values<string>(Countries).includes(val)) {
            return val as Countries;
        } else {
            throw Error(`invalid OwnerHouse ${val}`);
        }
    }

    private parseBoolean(val: string): boolean {
        return val !== "0";
    }
}

export class TriggerManager {
    private triggerTypes = new Map<string, AITriggerType>();

    constructor(
        gameApi: GameApi,
        private difficulty: BotDifficulty,
    ) {
        this.processAiIni(gameApi.getAiIni());
    }

    private processAiIni(aiIni: IniFile) {
        const aiTriggerTypes = aiIni.getSection("AITriggerTypes");
        if (!aiTriggerTypes) {
            throw new Error("missing AITriggerTypes");
        }
        aiTriggerTypes.entries.forEach((value, id) => {
            this.triggerTypes.set(id, new AITriggerType(id, value));
        });
    }

    public onAiUpdate(game: GameApi, myPlayer: PlayerData) {
        // checking which triggers are valid...
        const validTriggers = [];
        for (const trigger of this.triggerTypes.values()) {
            if (trigger.side === AiSideType.Soviet && myPlayer.country?.side !== SideType.Nod) {
                continue;
            }
            if (trigger.side === AiSideType.Allied && myPlayer.country?.side !== SideType.GDI) {
                continue;
            }
            if (
                trigger.ownerHouse === OwnerHouse.None ||
                (trigger.ownerHouse !== OwnerHouse.All && trigger.ownerHouse !== myPlayer.country?.name)
            ) {
                continue;
            }
            if (!trigger.enabledInEasy && this.difficulty === BotDifficulty.Easy) {
                continue;
            }
            if (!trigger.enabledInMedium && this.difficulty === BotDifficulty.Medium) {
                continue;
            }
            if (!trigger.enabledInHard && this.difficulty === BotDifficulty.Hard) {
                continue;
            }
            validTriggers.push(trigger);
        }
    }
}
