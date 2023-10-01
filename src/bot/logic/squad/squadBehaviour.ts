import { ActionsApi, GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { ExpansionSquad } from "./behaviours/expansionSquad.js";
import { Squad } from "./squad.js";

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
    unitName: string;
    priority: number;
};

export const noop = () => ({ type: "noop" } as SquadActionNoop);

export const disband = () => ({ type: "disband" } as SquadActionDisband);

export const requestUnits = (unitName: string, priority: number) =>
    ({ type: "request", unitName, priority } as SquadActionRequestUnits);

export type SquadAction = SquadActionNoop | SquadActionDisband | SquadActionMergeInto | SquadActionRequestUnits;

export interface SquadBehaviour {
    onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        squad: Squad,
        threatData: GlobalThreat | undefined
    ): SquadAction;
}
