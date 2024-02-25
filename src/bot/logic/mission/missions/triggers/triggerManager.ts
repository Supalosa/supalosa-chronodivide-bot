// State management for ai.ini TriggerTypes

import { AiTriggerType, ComparatorOperator, ConditionType } from "./aiTriggerTypes.js";
import { AiTeamType } from "./aiTeamTypes.js";
import { AiTaskForce } from "./aiTaskForces.js";
import { AiScriptType } from "./scriptTypes.js";

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

type ResolvedTeamType = Omit<AiTeamType, "taskForce" | "script"> & {
    taskForce: AiTaskForce;
    script: AiScriptType;
};

type ResolvedTriggerType = Omit<AiTriggerType, "teamType"> & {
    teamType: ResolvedTeamType;
};
