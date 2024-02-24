// Interpreter for ai.ini TriggerTypes

import { Countries } from "../../../common/utils.js";

export enum AiTriggerOwnerHouse {
    None = "<none>",
    All = "<all>",
}

export enum AiTriggerSideType {
    All = 0,
    Allied = 1,
    Soviet = 2,
}

export enum ConditionType {
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

const conditionEvaluators: Map<ConditionType, string> = new Map([
    [ConditionType.AlwaysTrue, "Always True"],
    [ConditionType.EnemyHouseOwns, "Enemy House Owns"],
    [ConditionType.OwningHouseOwns, "Owning House Owns"],
    [ConditionType.EnemyHouseInYellowPower, "Enemy House In Yellow Power"],
    [ConditionType.EnemyHouseInRedPower, "Enemy House In Red Power"],
    [ConditionType.EnemyHouseHasCredits, "Enemy House Has Credits"],
    [ConditionType.OwnerHasIronCurtainReady, "Owner Has Iron Curtain Ready"],
    [ConditionType.OwnerHasChronoSphereReady, "Owner Has Chronosphere Ready"],
    [ConditionType.NeutralHouseOwns, "Neutral House Owns"],
]);

export enum ComparatorOperator {
    LessThan = 0,
    LessThanOrEqual = 1,
    Equal = 2,
    GreaterThanOrEqual = 3,
    GreaterThan = 4,
    NotEqual = 5,
}

const comparatorOperators: Map<ComparatorOperator, string> = new Map([
    [ComparatorOperator.LessThan, "<"],
    [ComparatorOperator.LessThanOrEqual, "<="],
    [ComparatorOperator.Equal, "=="],
    [ComparatorOperator.GreaterThanOrEqual, ">="],
    [ComparatorOperator.GreaterThan, ">"],
    [ComparatorOperator.GreaterThan, "!="],
]);

// https://modenc.renegadeprojects.com/AITriggerTypes
export class AiTriggerType {
    public readonly name: string;
    public readonly teamType: string;
    public readonly ownerHouse: AiTriggerOwnerHouse | Countries;
    public readonly techLevel: number; // Not implemented
    public readonly conditionType: ConditionType;
    public readonly comparisonObject: string;
    public readonly comparator: string;
    public readonly startingWeight: number;
    public readonly minimumWeight: number;
    public readonly maximumWeight: number;
    public readonly isForSkirmish: boolean; // Not implemented, assumed true
    public readonly side: AiTriggerSideType;
    public readonly isBaseDefence: boolean;
    public readonly otherTeamType: string;
    public readonly enabledInEasy: boolean;
    public readonly enabledInMedium: boolean;
    public readonly enabledInHard: boolean;

    public readonly comparatorArgument: number;
    public readonly comparatorOperator: ComparatorOperator;

    private readonly descriptionText: string;

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
        this.isBaseDefence = this.parseBoolean(values[13]);
        this.otherTeamType = values[14];
        this.enabledInEasy = this.parseBoolean(values[15]);
        this.enabledInMedium = this.parseBoolean(values[16]);
        this.enabledInHard = this.parseBoolean(values[17]);

        this.comparatorArgument = this.parseLittleEndianHex(this.comparator.slice(0, 8));
        this.comparatorOperator = this.parseLittleEndianHex(this.comparator.slice(8, 16));

        this.descriptionText = this.describeComparator();
    }

    private describeComparator() {
        const conditionName = conditionEvaluators.get(this.conditionType) ?? `Unknown Condition ${this.conditionType}`;
        const comparatorOperatorText =
            comparatorOperators.get(this.comparatorOperator) ?? `Unknown Operator ${this.comparatorOperator}`;
        const comparatorArgument = this.comparatorArgument;
        return `${conditionName} ${this.comparisonObject} ${comparatorOperatorText} ${comparatorArgument}`;
    }

    public toString() {
        return `${this.descriptionText}: ${this.name}`;
    }

    /**
     *
     * @param val string containing an octet of hexadecimal characters
     */
    private parseLittleEndianHex(val: string): number {
        if (val.length !== 8) {
            throw new Error(`Expected hex string of length 8, got: ${val}`);
        }
        // the comparator consists of octets without spaces in little-endian hex form (so 04000000 = 04 00 .. = 4)
        let str = "";
        for (let i = 0; i < 8; i += 2) {
            str = val.slice(i, i + 2) + str;
        }
        return parseInt(str, 16);
    }

    private parseOwnerHouse(val: string): AiTriggerOwnerHouse | Countries {
        if (val === AiTriggerOwnerHouse.None) {
            return AiTriggerOwnerHouse.None;
        } else if (val === AiTriggerOwnerHouse.All) {
            return AiTriggerOwnerHouse.All;
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
