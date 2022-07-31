import { GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { SquadExpansion } from "./behaviours/squadExpansion.js";
import { SquadScouters } from "./behaviours/squadScouters.js";
import { Squad } from "./squad.js";

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
export type SquadActionClaimUnits = {
    type: 'claimUnit';
    unitIds: number[];
}

export type SquadAction = SquadActionNoop | SquadActionDisband | SquadActionMergeInto | SquadActionClaimUnits;

export interface SquadBehaviour {
    onAiUpdate(gameApi: GameApi, playerData: PlayerData, squad: Squad, threatData: GlobalThreat | undefined) : SquadAction;

    // Request construction of specific unit(s) (no guarantee they will be created)
    requestConstruction(gameApi: GameApi, playerData: PlayerData, squad: Squad, threatData: GlobalThreat | undefined): {rules: TechnoRules, priority: number}[];
}

export const allSquadBehaviours: SquadBehaviour[] = [
    new SquadScouters(),
    new SquadExpansion()
];