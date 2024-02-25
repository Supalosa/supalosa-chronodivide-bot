import { ActionsApi, GameApi, PlayerData } from "@chronodivide/game-api";
import { MatchAwareness } from "../../../awareness.js";
import { ResolvedScriptTypeEntry, ScriptTypeAction } from "../triggers/scriptTypes.js";
import { ActionBatcher } from "../../actionBatcher.js";
import { DebugLogger } from "../../../common/utils.js";
import { Mission } from "../../mission.js";

import { MoveToHandler, MoveToTargetType } from "./moveToBuildingHandlers.js";
import { GatherOrRegroupHandler, GatherOrRegroup } from "./gatherRegroupHandlers.js";
import { GuardAreaHandler } from "./guardAreaHandler.js";

type Repeat = {
    type: "repeat";
};

// Move on to next.
type Step = {
    type: "step";
};

type Disband = {
    type: "disband";
};

type GoToLine = {
    type: "goToLine";
    line: number;
};

export type ScriptStepResult = Repeat | Step | Disband | GoToLine;

// Using an argument object here to make it easier to add more arguments in the future.
export type OnStepArgs = {
    scriptStep: ResolvedScriptTypeEntry;
    gameApi: GameApi;
    mission: Mission<any>;
    actionsApi: ActionsApi;
    actionBatcher: ActionBatcher;
    playerData: PlayerData;
    matchAwareness: MatchAwareness;
    logger: DebugLogger;
};

export interface ScriptStepHandler {
    onStart?(args: OnStepArgs): void;

    onStep(args: OnStepArgs): ScriptStepResult;

    onCleanup?(args: OnStepArgs): void;
}

export const SCRIPT_STEP_HANDLERS = new Map<ScriptTypeAction, () => ScriptStepHandler>([
    [ScriptTypeAction.GuardArea, () => new GuardAreaHandler()],
    [ScriptTypeAction.MoveToEnemyStructure, () => new MoveToHandler(MoveToTargetType.Enemy)],
    [ScriptTypeAction.GatherAtEnemyBase, () => new GatherOrRegroupHandler(GatherOrRegroup.Gather)],
    [ScriptTypeAction.RegroupAtFriendlyBase, () => new GatherOrRegroupHandler(GatherOrRegroup.Regroup)],
    [ScriptTypeAction.MoveToFriendlyStructure, () => new MoveToHandler(MoveToTargetType.Friendly)],
]);
