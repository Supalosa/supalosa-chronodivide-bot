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

const conditionEvaluators: Map<ConditionType, ConditionEvaluator> = new Map([
    [ConditionType.AlwaysTrue, () => true],
    [ConditionType.EnemyHouseOwns, enemyHouseOwns],
    [ConditionType.OwningHouseOwns, owningHouseOwns],
    [ConditionType.EnemyHouseInYellowPower, EVALUATOR_NOT_IMPLEMENTED],
    [ConditionType.EnemyHouseInRedPower, EVALUATOR_NOT_IMPLEMENTED],
    [ConditionType.EnemyHouseHasCredits, EVALUATOR_NOT_IMPLEMENTED],
    [ConditionType.OwnerHasIronCurtainReady, EVALUATOR_NOT_IMPLEMENTED],
    [ConditionType.OwnerHasChronoSphereReady, EVALUATOR_NOT_IMPLEMENTED],
    [ConditionType.NeutralHouseOwns, EVALUATOR_NOT_IMPLEMENTED],
]);

export class TriggerManager {
    private triggerTypes = new Map<string, AiTriggerType>();

    private previousValidTriggers = new Set<string>();

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
            this.triggerTypes.set(id, new AiTriggerType(id, value));
        });
    }

    public onAiUpdate(game: GameApi, myPlayer: PlayerData, logger: LoggerApi) {
        const firingTriggers = [];

        // Calculate expensive things only once before all triggers.
        const enemyUnits = game.getVisibleUnits(myPlayer.name, "enemy");
        const ownUnits = game.getVisibleUnits(myPlayer.name, "self");

        const triggerCacheState: AiTriggerCacheState = {
            enemyUnitCount: countBy(enemyUnits, (id) => game.getGameObjectData(id)?.name),
            ownUnitCount: countBy(ownUnits, (id) => game.getGameObjectData(id)?.name),
        };

        for (const trigger of this.triggerTypes.values()) {
            if (trigger.side === AiTriggerSideType.Soviet && myPlayer.country?.side !== SideType.Nod) {
                continue;
            }
            if (trigger.side === AiTriggerSideType.Allied && myPlayer.country?.side !== SideType.GDI) {
                continue;
            }
            if (
                trigger.ownerHouse === AiTriggerOwnerHouse.None ||
                (trigger.ownerHouse !== AiTriggerOwnerHouse.All && trigger.ownerHouse !== myPlayer.country?.name)
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
            const conditionEvaluator = conditionEvaluators.get(trigger.conditionType);
            if (!conditionEvaluator) {
                throw new Error(`Missing condition evaluator ${trigger.conditionType} for ${trigger}`);
            }
            const { comparisonObject, comparatorArgument, comparatorOperator } = trigger;
            if (conditionEvaluator(triggerCacheState, comparisonObject, comparatorArgument, comparatorOperator)) {
                firingTriggers.push(trigger);
            }
        }
        const newTriggerSet = new Set(firingTriggers.map(({ name }) => name));

        const diff = setDifference(this.previousValidTriggers, newTriggerSet);
        if (diff.length > 0) {
            logger.info("Trigger update", diff);
        }

        this.previousValidTriggers = newTriggerSet;
    }
}
