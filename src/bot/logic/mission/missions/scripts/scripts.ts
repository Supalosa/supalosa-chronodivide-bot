import { ActionsApi, GameApi } from "@chronodivide/game-api";
import { MatchAwareness } from "../../../awareness.js";
import { AiScriptType, ScriptTypeAction } from "../triggers/scriptTypes.js";
import { ActionBatcher } from "../../actionBatcher.js";
import { DebugLogger } from "../../../common/utils.js";

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

type ScriptStepResult = Repeat | Step | Disband | GoToLine;

export type OnStepArgs = {
    gameApi: GameApi;
    actionsApi: ActionsApi;
    actionBatcher: ActionBatcher;
    matchAwareness: MatchAwareness;
    logger: DebugLogger;
};

export interface ScriptStepHandler {
    onStartStep?(): void;

    onStep(args: OnStepArgs): ScriptStepResult;

    onCleanupStep?(): void;
}

export const SCRIPT_STEP_HANDLERS = new Map<ScriptTypeAction, () => ScriptStepHandler>([
    [ScriptTypeAction.GatherAtEnemyBase, () => new GatherAtEnemyBase()],
]);

class GatherAtEnemyBase implements ScriptStepHandler {
    onStep({ matchAwareness, gameApi }: OnStepArgs): ScriptStepResult {
        return { type: "repeat" };
    }
}
