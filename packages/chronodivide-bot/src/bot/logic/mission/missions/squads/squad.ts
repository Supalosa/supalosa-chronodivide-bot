import { ActionsApi, BotContext, GameApi, PlayerData } from "@chronodivide/game-api";
import { ActionBatcher } from "../../actionBatcher";
import { Mission, MissionAction } from "../../mission";
import { MatchAwareness } from "../../../awareness";
import { DebugLogger } from "../../../common/utils";

export interface Squad {
    onAiUpdate(
        context: BotContext,
        actionBatcher: ActionBatcher,
        mission: Mission<any>,
        matchAwareness: MatchAwareness,
        logger: DebugLogger,
    ): MissionAction;

    getGlobalDebugText(): string | undefined;
}
