import { AiScriptType, ScriptTypeAction } from "../triggers/scriptTypes";

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

export type OnStepArgs = {};

export interface ScriptStepHandler {
    onStartStep?(): void;

    onStep(args: OnStepArgs): ScriptStepResult;

    onCleanupStep?(): void;
}

export const SCRIPT_STEP_HANDLERS = new Map<ScriptTypeAction, ScriptStepHandler>([]);

class GatherAtEnemyBase implements ScriptStepHandler {
    onStep(args: OnStepArgs): ScriptStepResult {
        return { type: "repeat" };
    }
}
