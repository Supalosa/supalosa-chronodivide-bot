import { AiScriptType, ScriptTypeAction } from "../triggers/scriptTypes";

type Repeat = {
    type: "repeat";
};

type Disband = {
    type: "disband";
};

type GoToLine = {
    type: "goToLine";
    line: number;
};

type ScriptStepResult = Repeat | Disband | GoToLine;

export interface ScriptStepHandler {
    onStartStep(): void;

    onStep(): ScriptStepResult;
}

export const SCRIPT_STEP_HANDLERS = new Map<ScriptTypeAction, ScriptStepHandler>([]);
