// State management for ai.ini TriggerTypes

import { GameApi, IniFile, LoggerApi, PlayerData, ProductionApi, SideType } from "@chronodivide/game-api";
import { BotDifficulty } from "../../bot.js";
import {
    AiTriggerOwnerHouse,
    AiTriggerSideType,
    AiTriggerType,
    ComparatorOperator,
    ConditionType,
} from "./aiTriggerTypes.js";
import { countBy, setDifference } from "../common/utils.js";
import { MissionController } from "../mission/missionController.js";
import { AiTeamType, loadTeamTypes } from "./aiTeamTypes.js";
import { AiTaskForce, loadTaskForces } from "./aiTaskForces.js";
import { AttackMission, generateTarget } from "../mission/missions/attackMission.js";
import { MatchAwareness } from "../awareness.js";
import { match } from "assert";

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

type ResolvedTeamType = Omit<AiTeamType, "taskForce"> & {
    taskForce: AiTaskForce;
};

type ResolvedTriggerType = Omit<AiTriggerType, "teamType"> & {
    teamType: ResolvedTeamType;
};

export class TriggerManager {
    private teamDelay: number;
    private triggerTypes = new Map<string, ResolvedTriggerType>();

    private dissolveUnfilledTeamDelay: number;

    private lastTeamCheckAt = 0;
    private previousValidTriggers = new Set<string>();

    constructor(gameApi: GameApi, playerData: PlayerData, difficulty: BotDifficulty) {
        const { teamDelays, triggerTypes, dissolveUnfilledTeamDelay } = this.loadIni(
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
        this.dissolveUnfilledTeamDelay = dissolveUnfilledTeamDelay;
    }

    private loadIni(rulesIni: IniFile, aiIni: IniFile, playerData: PlayerData, difficulty: BotDifficulty) {
        const triggerTypes = new Map<string, ResolvedTriggerType>();
        const aiTriggerTypes = aiIni.getSection("AITriggerTypes");
        if (!aiTriggerTypes) {
            throw new Error("missing AITriggerTypes");
        }

        const aiTeamTypes = loadTeamTypes(aiIni);
        const aiTaskForces = loadTaskForces(aiIni);

        type ResolvedTeamTypes = { [name: string]: ResolvedTeamType };

        const resolvedTeamTypes: ResolvedTeamTypes = Object.entries(aiTeamTypes).reduce<ResolvedTeamTypes>((pV, cV) => {
            const [teamName, teamType] = cV;
            return Object.assign(pV, { [teamName]: { ...teamType, taskForce: aiTaskForces[teamType.taskForce] } });
        }, {});

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
            const resolvedTriggerType = {
                ...trigger,
                teamType: resolvedTeamTypes[trigger.teamType],
            };
            triggerTypes.set(id, resolvedTriggerType);
        });

        const teamDelays = rulesIni
            .getSection("General")
            ?.get("TeamDelays")
            ?.split(",")
            .map((s) => parseInt(s));
        if (!teamDelays) {
            throw new Error("missing TeamDelays");
        }

        const dissolveUnfilledTeamDelay = parseInt(
            rulesIni.getSection("General")?.get("DissolveUnfilledTeamDelay") ?? "",
        );
        if (!dissolveUnfilledTeamDelay) {
            throw new Error("missing DissolveUnfilledTeamDelay");
        }
        return { triggerTypes, teamDelays, dissolveUnfilledTeamDelay };
    }

    public onAiUpdate(
        game: GameApi,
        productionApi: ProductionApi,
        myPlayer: PlayerData,
        missionController: MissionController,
        logger: LoggerApi,
    ) {
        if (game.getCurrentTick() > this.lastTeamCheckAt + this.teamDelay) {
            this.runTeamCheck(game, productionApi, myPlayer, logger);
            this.lastTeamCheckAt = game.getCurrentTick();
        }
    }

    public runTeamCheck(
        game: GameApi,
        production: ProductionApi,
        matchAwareness: MatchAwareness,
        myPlayer: PlayerData,
        logger: LoggerApi,
    ) {
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

        // Only allow triggers to be chosen if we can actually produce them
        const producableUnits = new Set(production.getAvailableObjects().map((r) => r.name));

        const firingTriggers = [...this.triggerTypes.values()].filter((trigger) => {
            if (trigger.teamType.taskForce) {
                const taskForceUnits = trigger.teamType.taskForce.units;
                if (Object.keys(taskForceUnits).some((unitName) => !producableUnits.has(unitName))) {
                    return false;
                }
            }

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
            logger.info("Mission diff", diff);
        }
        this.previousValidTriggers = newTriggerSet;

        if (firingTriggers.length === 0) {
            return;
        }

        // TODO: implementing changing weights.
        const chosenMission = this.weightedRandom(
            game,
            firingTriggers.map((trigger) => ({ item: trigger, weight: trigger.startingWeight })),
        );

        if (!chosenMission) {
            return;
        }
        logger.info("Chosen mission", chosenMission);
        // TODO: implement attack target from script.
        const attackTarget = generateTarget(game, myPlayer, matchAwareness, true);
        if (!attackTarget) {
            return;
        }
        const mission = new AttackMission(
            `aiTriggerMission_${chosenMission.name}_${game.getCurrentTick()}`,
            chosenMission.teamType.priority,
            matchAwareness.getMainRallyPoint(),
            attackTarget,
            30,
            (message) => logger.info(message),
            chosenMission.teamType.taskForce.units,
            this.dissolveUnfilledTeamDelay,
        );
    }

    // https://stackoverflow.com/a/55671924
    private weightedRandom<T>(gameApi: GameApi, items: { item: T; weight: number }[]) {
        const adjWeights = items.map((item) => item.weight);

        for (let i = 1; i < items.length; i++) {
            adjWeights[i] += adjWeights[i - 1];
        }

        const random = gameApi.generateRandom() * adjWeights[adjWeights.length - 1];

        for (let i = 0; i < items.length; i++) {
            if (adjWeights[i] > random) {
                return items[i].item;
            }
        }

        return null;
    }
}
