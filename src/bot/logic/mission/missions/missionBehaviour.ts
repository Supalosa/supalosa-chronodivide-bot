import { ActionsApi, GameApi, PlayerData } from "@chronodivide/game-api";
import { ActionBatcher } from "../actionBatcher";
import { Mission, MissionAction } from "../mission";
import { MatchAwareness } from "../../awareness";
import { DebugLogger } from "../../common/utils";

export interface MissionBehaviour {
    onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        actionBatcher: ActionBatcher,
        playerData: PlayerData,
        mission: Mission<MissionBehaviour, any>,
        matchAwareness: MatchAwareness,
        logger: DebugLogger,
    ): MissionAction;

    getGlobalDebugText(): string | undefined;
}
