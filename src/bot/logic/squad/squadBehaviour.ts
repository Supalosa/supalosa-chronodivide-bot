import { ActionsApi, GameApi, PlayerData, Vector2 } from "@chronodivide/game-api";
import { Squad } from "./squad.js";
import { MatchAwareness } from "../awareness.js";
import { DebugLogger } from "../common/utils.js";
import { ActionBatcher } from "./behaviours/actionBatcher.js";

export type SquadActionNoop = {
    type: "noop";
};
export type SquadActionDisband = {
    type: "disband";
};
export type SquadActionMergeInto = {
    type: "mergeInto";
    mergeInto: Squad;
};
export type SquadActionRequestUnits = {
    type: "request";
    unitNames: string[];
    priority: number;
};
export type SquadActionRequestSpecificUnits = {
    type: "requestSpecific";
    unitIds: number[];
    priority: number;
};
export type SquadActionGrabFreeCombatants = {
    type: "requestCombatants";
    point: Vector2;
    radius: number;
};

export const noop = () => ({ type: "noop" }) as SquadActionNoop;

export const disband = () => ({ type: "disband" }) as SquadActionDisband;

export const requestUnits = (unitNames: string[], priority: number) =>
    ({ type: "request", unitNames, priority }) as SquadActionRequestUnits;

export const requestSpecificUnits = (unitIds: number[], priority: number) =>
    ({ type: "requestSpecific", unitIds, priority }) as SquadActionRequestSpecificUnits;

export const grabCombatants = (point: Vector2, radius: number) =>
    ({ type: "requestCombatants", point, radius }) as SquadActionGrabFreeCombatants;

export type SquadAction =
    | SquadActionNoop
    | SquadActionDisband
    | SquadActionMergeInto
    | SquadActionRequestUnits
    | SquadActionRequestSpecificUnits
    | SquadActionGrabFreeCombatants;

export interface SquadBehaviour {
    onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        actionBatcher: ActionBatcher,
        playerData: PlayerData,
        squad: Squad,
        matchAwareness: MatchAwareness,
        logger: DebugLogger,
    ): SquadAction;
}
