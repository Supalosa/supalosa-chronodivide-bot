import { GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { GlobalThreat } from "../../threat/threat.js";
import { Squad } from "../squad.js";
import { SquadAction, SquadActionNoop, SquadBehaviour } from "../squadBehaviour.js";

// Expansion or initial base.
export class SquadExpansion implements SquadBehaviour {
    public requestConstruction(gameApi: GameApi, playerData: PlayerData, squad: Squad, threatData: GlobalThreat | undefined): {rules: TechnoRules, priority: number}[] {
        return [];
    }

    public onAiUpdate(gameApi: GameApi, playerData: PlayerData, squad: Squad, threatData: GlobalThreat | undefined): SquadAction {
        return {} as SquadActionNoop;
    }

}