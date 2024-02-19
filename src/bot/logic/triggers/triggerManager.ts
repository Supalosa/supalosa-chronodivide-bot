// State management for ai.ini TriggerTypes

import { GameApi, IniFile, LoggerApi, PlayerData, SideType } from "@chronodivide/game-api";
import { BotDifficulty } from "../../bot.js";
import {
    AiTriggerOwnerHouse,
    AiTriggerSideType,
    AiTriggerType,
    ComparatorOperator,
    ConditionType,
} from "./aiTriggerTypes.js";
import { countBy, setDifference } from "../common/utils.js";

type AiTriggerCacheState = {
    enemyUnitCount: { [name: string]: number };
    ownUnitCount: { [name: string]: number };
    enemyCredits: number;
};

type ConditionEvaluator = (
    triggerCacheState: AiTriggerCacheState,
    comparisonObject: string,
    comparatorArgument: number,
    comparatorOperator: ComparatorOperator,
) => boolean;

const EVALUATOR_NOT_IMPLEMENTED = () => false;

const testOperator = (value: number, operator: ComparatorOperator, operand: number) => {
    switch (operator) {
        case ComparatorOperator.Equal:
            return value === operand;
        case ComparatorOperator.GreaterThan:
            return value > operand;
        case ComparatorOperator.GreaterThanOrEqual:
            return value >= operand;
        case ComparatorOperator.LessThan:
            return value < operand;
        case ComparatorOperator.LessThanOrEqual:
            return value <= operand;
        case ComparatorOperator.NotEqual:
            return value > operand;
    }
};

const enemyHouseOwns: ConditionEvaluator = (
    triggerCacheState,
    comparisonObject,
    comparatorArgument,
    comparatorOperator,
) => {
    return testOperator(
        triggerCacheState.enemyUnitCount[comparisonObject] ?? 0,
        comparatorOperator,
        comparatorArgument,
    );
};

const owningHouseOwns: ConditionEvaluator = (
    triggerCacheState,
    comparisonObject,
    comparatorArgument,
    comparatorOperator,
) => {
    return testOperator(triggerCacheState.ownUnitCount[comparisonObject] ?? 0, comparatorOperator, comparatorArgument);
};

const enemyHouseHasCredits: ConditionEvaluator = (
    triggerCacheState,
    comparisonObject,
    comparatorArgument,
    comparatorOperator,
) => {
    return testOperator(triggerCacheState.enemyCredits, comparatorOperator, comparatorArgument);
};

const conditionEvaluators: Map<ConditionType, ConditionEvaluator> = new Map([
    [ConditionType.AlwaysTrue, () => true],
    [ConditionType.EnemyHouseOwns, enemyHouseOwns],
    [ConditionType.OwningHouseOwns, owningHouseOwns],
    [ConditionType.EnemyHouseInYellowPower, EVALUATOR_NOT_IMPLEMENTED],
    [ConditionType.EnemyHouseInRedPower, EVALUATOR_NOT_IMPLEMENTED],
    [ConditionType.EnemyHouseHasCredits, enemyHouseHasCredits],
    [ConditionType.OwnerHasIronCurtainReady, EVALUATOR_NOT_IMPLEMENTED],
    [ConditionType.OwnerHasChronoSphereReady, EVALUATOR_NOT_IMPLEMENTED],
    [ConditionType.NeutralHouseOwns, EVALUATOR_NOT_IMPLEMENTED],
]);

export class TriggerManager {
    private teamDelay: number;
    private triggerTypes = new Map<string, AiTriggerType>();

    private lastTeamCheckAt = 0;
    private previousValidTriggers = new Set<string>();

    constructor(gameApi: GameApi, playerData: PlayerData, difficulty: BotDifficulty) {
        const { teamDelays, triggerTypes } = this.loadIni(
            gameApi.getRulesIni(),
            gameApi.getAiIni(),
            playerData,
            difficulty,
        );
        switch (difficulty) {
            case BotDifficulty.Easy:
                this.teamDelay = teamDelays[2];
                break;
            case BotDifficulty.Medium:
                this.teamDelay = teamDelays[1];
                break;
            case BotDifficulty.Hard:
                this.teamDelay = teamDelays[0];
                break;
        }
        this.triggerTypes = triggerTypes;
    }

    private loadIni(
        rulesIni: IniFile,
        aiIni: IniFile,
        playerData: PlayerData,
        difficulty: BotDifficulty,
    ): { triggerTypes: Map<string, AiTriggerType>; teamDelays: number[] } {
        const triggerTypes = new Map<string, AiTriggerType>();
        const aiTriggerTypes = aiIni.getSection("AITriggerTypes");
        if (!aiTriggerTypes) {
            throw new Error("missing AITriggerTypes");
        }
        aiTriggerTypes.entries.forEach((value, id) => {
            const trigger = new AiTriggerType(id, value);
            // Don't store triggers that are not relevant to this agent.
            if (trigger.side === AiTriggerSideType.Soviet && playerData.country?.side !== SideType.Nod) {
                return;
            }
            if (trigger.side === AiTriggerSideType.Allied && playerData.country?.side !== SideType.GDI) {
                return;
            }
            if (
                trigger.ownerHouse === AiTriggerOwnerHouse.None ||
                (trigger.ownerHouse !== AiTriggerOwnerHouse.All && trigger.ownerHouse !== playerData.country?.name)
            ) {
                return;
            }
            if (!trigger.enabledInEasy && difficulty === BotDifficulty.Easy) {
                return;
            }
            if (!trigger.enabledInMedium && difficulty === BotDifficulty.Medium) {
                return;
            }
            if (!trigger.enabledInHard && difficulty === BotDifficulty.Hard) {
                return;
            }
            triggerTypes.set(id, trigger);
        });

        const teamDelays = rulesIni
            .getSection("General")
            ?.get("TeamDelays")
            ?.split(",")
            .map((s) => parseInt(s));
        if (!teamDelays) {
            throw new Error("missing TeamDelays");
        }
        return { triggerTypes, teamDelays };
    }

    public onAiUpdate(game: GameApi, myPlayer: PlayerData, logger: LoggerApi) {
        if (game.getCurrentTick() > this.lastTeamCheckAt + this.teamDelay) {
            this.runTeamCheck(game, myPlayer, logger);
            this.lastTeamCheckAt = game.getCurrentTick();
        }
    }

    public runTeamCheck(game: GameApi, myPlayer: PlayerData, logger: LoggerApi) {
        // Calculate expensive things only once before all triggers.
        const enemyUnits = game.getVisibleUnits(myPlayer.name, "enemy");
        const ownUnits = game.getVisibleUnits(myPlayer.name, "self");

        const enemyCredits = game
            .getPlayers()
            .filter((name) => !game.areAlliedPlayers(myPlayer.name, name))
            .map((name) => game.getPlayerData(name).credits)
            .reduce((p, v) => p + v, 0);

        const triggerCacheState: AiTriggerCacheState = {
            enemyUnitCount: countBy(enemyUnits, (id) => game.getGameObjectData(id)?.name),
            ownUnitCount: countBy(ownUnits, (id) => game.getGameObjectData(id)?.name),
            enemyCredits,
        };

        const firingTriggers = [...this.triggerTypes.values()].filter((trigger) => {
            const conditionEvaluator = conditionEvaluators.get(trigger.conditionType);
            if (!conditionEvaluator) {
                throw new Error(`Missing condition evaluator ${trigger.conditionType} for ${trigger}`);
            }
            const { comparisonObject, comparatorArgument, comparatorOperator } = trigger;
            return conditionEvaluator(triggerCacheState, comparisonObject, comparatorArgument, comparatorOperator);
        });
        const newTriggerSet = new Set(firingTriggers.map(({ name }) => name));

        const diff = setDifference(this.previousValidTriggers, newTriggerSet);
        if (diff.length > 0) {
            logger.info("Trigger update", diff);
        }

        // TODO: implementing changing weights.
        const totalWeights = firingTriggers.reduce((p, v) => v.startingWeight, 0);

        this.previousValidTriggers = newTriggerSet;
    }
}
