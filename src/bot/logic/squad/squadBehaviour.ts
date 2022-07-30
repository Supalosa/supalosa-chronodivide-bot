import { GameApi, PlayerData } from "@chronodivide/game-api";
import { Squad } from "./squad";

export type SquadActionNoop = {
    type: 'noop';
};
export type SquadActionDisband = {
    type: 'disband';
};
export type SquadActionMergeInto = {
    type: 'mergeInto';
    mergeInto: Squad;
};

export type SquadAction = SquadActionNoop | SquadActionDisband | SquadActionMergeInto;

export interface SquadBehaviour {
    onAiUpdate(gameApi: GameApi, playerData: PlayerData, squad: Squad) : SquadAction;
}