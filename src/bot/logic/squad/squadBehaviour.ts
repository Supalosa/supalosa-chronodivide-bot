import { ActionsApi, GameApi, PlayerData, Point2D } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { Squad } from "./squad.js";
import { MatchAwareness } from "../awareness.js";

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
export type SquadActionGrabFreeCombatants = {
    type: "requestCombatants";
    point: Point2D;
    radius: number;
};

export const noop = () => ({ type: "noop" } as SquadActionNoop);

export const disband = () => ({ type: "disband" } as SquadActionDisband);

export const requestUnits = (unitNames: string[], priority: number) =>
    ({ type: "request", unitNames, priority } as SquadActionRequestUnits);

export const grabCombatants = (point: Point2D, radius: number) =>
    ({ type: "requestCombatants", point, radius } as SquadActionGrabFreeCombatants);

export type SquadAction =
    | SquadActionNoop
    | SquadActionDisband
    | SquadActionMergeInto
    | SquadActionRequestUnits
    | SquadActionGrabFreeCombatants;

export interface SquadBehaviour {
    onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        squad: Squad,
        matchAwareness: MatchAwareness
    ): SquadAction;
}
