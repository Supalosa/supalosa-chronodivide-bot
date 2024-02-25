import { ActionsApi, GameApi, PlayerData } from "@chronodivide/game-api";
import { MatchAwareness } from "../../../awareness.js";
import { JumpToLineStep, ResolvedScriptTypeEntry, ScriptTypeAction } from "../triggers/scriptTypes.js";
import { ActionBatcher } from "../../actionBatcher.js";
import { DebugLogger } from "../../../common/utils.js";
import { Mission } from "../../mission.js";

import { MoveToHandler, MoveToTargetType } from "./moveToBuildingHandlers.js";
import { GatherOrRegroupHandler, GatherOrRegroup } from "./gatherRegroupHandlers.js";
import { GuardAreaHandler } from "./guardAreaHandler.js";
import { AttackQuarryTypeHandler } from "./attackQuarryTypeHandler.js";

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
    [ScriptTypeAction.AttackQuarryType, () => new AttackQuarryTypeHandler()],
    [ScriptTypeAction.GuardArea, () => new GuardAreaHandler()],
    [ScriptTypeAction.JumpToLine, () => new JumpToLineHandler()],
    [ScriptTypeAction.MoveToEnemyStructure, () => new MoveToHandler(MoveToTargetType.Enemy)],
    [ScriptTypeAction.RegisterSuccess, () => new RegisterSuccess()],
    [ScriptTypeAction.GatherAtEnemyBase, () => new GatherOrRegroupHandler(GatherOrRegroup.Gather)],
    [ScriptTypeAction.RegroupAtFriendlyBase, () => new GatherOrRegroupHandler(GatherOrRegroup.Regroup)],
    [ScriptTypeAction.MoveToFriendlyStructure, () => new MoveToHandler(MoveToTargetType.Friendly)],
]);

/**
 * TODO for implementation:
   8 12 -> Unload
   11 15 -> AssignNewMission
   14 13 -> LoadOntoTransport
   21 1 -> Scatter
   43 13 -> WaitUntilFullyLoaded
   46 35 -> AttackEnemyStructure
   49 65 -> RegisterSuccess
   55 7 -> ActivateIronCurtainOnTaskForce
   57 2 -> ChronoshiftTaskForceToTargetType
 */

class JumpToLineHandler implements ScriptStepHandler {
    onStep({ scriptStep }: OnStepArgs): GoToLine {
        const args = scriptStep as JumpToLineStep;
        return { type: "goToLine", line: args.line - 1 };
    }
}

// No-op until we have mutable trigger weighting.
class RegisterSuccess implements ScriptStepHandler {
    onStep(): Step {
        return { type: "step" };
    }
}
