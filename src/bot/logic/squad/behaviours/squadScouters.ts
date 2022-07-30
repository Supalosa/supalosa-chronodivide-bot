import { GameApi, PlayerData } from "@chronodivide/game-api";
import { Squad } from "../squad";
import { SquadAction, SquadActionNoop, SquadBehaviour } from "../squadBehaviour";

export class SquadScouters implements SquadBehaviour {

    public onAiUpdate(gameApi: GameApi, playerData: PlayerData, squad: Squad): SquadAction {
        
        return {} as SquadActionNoop;
    }

}