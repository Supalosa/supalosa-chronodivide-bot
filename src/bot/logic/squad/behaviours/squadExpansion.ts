import { GameApi, PlayerData, SideType, TechnoRules } from "@chronodivide/game-api";
import { GlobalThreat } from "../../threat/threat.js";
import { Squad } from "../squad.js";
import { SquadAction, SquadActionNoop, SquadBehaviour } from "../squadBehaviour.js";

// Expansion or initial base.
export class SquadExpansion implements SquadBehaviour {
    public getDesiredComposition(
        gameApi: GameApi,
        playerData: PlayerData,
        squad: Squad,
        threatData: GlobalThreat | undefined,
    ): { unitName: string; priority: number; amount: number }[] {
        // This squad desires an MCV.
        let myMcvName = playerData.country?.side == SideType.GDI ? "AMCV" : "SMCV";
        return [
            {
                unitName: myMcvName,
                priority: 10,
                amount: 1,
            },
        ];
    }

    public onAiUpdate(
        gameApi: GameApi,
        playerData: PlayerData,
        squad: Squad,
        threatData: GlobalThreat | undefined,
    ): SquadAction {
        return {} as SquadActionNoop;
    }
}
