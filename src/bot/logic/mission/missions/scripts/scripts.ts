import { ActionsApi, GameApi, PlayerData } from "@chronodivide/game-api";
import { MatchAwareness } from "../../../awareness.js";
import { AiScriptType, ScriptTypeAction } from "../triggers/scriptTypes.js";
import { ActionBatcher } from "../../actionBatcher.js";
import { DebugLogger } from "../../../common/utils.js";
import { CombatSquad } from "../squads/combatSquad.js";
import { Mission } from "../../mission.js";

type Repeat = {
    type: "repeat";
};

// Move on to next.
type Step = {
    type: "step";
};

type Disband = {
    type: "disband";
};

type GoToLine = {
    type: "goToLine";
    line: number;
};

type ScriptStepResult = Repeat | Step | Disband | GoToLine;

// Using an argument object here to make it easier to add more arguments in the future.
export type OnStepArgs = {
    gameApi: GameApi;
    mission: Mission<any>;
    actionsApi: ActionsApi;
    actionBatcher: ActionBatcher;
    playerData: PlayerData;
    matchAwareness: MatchAwareness;
    logger: DebugLogger;
};

export interface ScriptStepHandler {
    onStartStep?(): void;

    onStep(args: OnStepArgs): ScriptStepResult;

    onCleanupStep?(): void;
}

export const SCRIPT_STEP_HANDLERS = new Map<ScriptTypeAction, () => ScriptStepHandler>([
    [ScriptTypeAction.GatherAtEnemyBase, () => new GatherAtEnemyBase()],
]);

class GatherAtEnemyBase implements ScriptStepHandler {
    private squad: CombatSquad | null = null;

    onStep({
        gameApi,
        mission,
        actionsApi,
        actionBatcher,
        playerData,
        matchAwareness,
        logger,
    }: OnStepArgs): ScriptStepResult {
        const gatherPoint = matchAwareness.getEnemyGatherPoint();
        if (!gatherPoint) {
            // Gather point may not exist at the start of the game, which is before any of these missions are created, but you never know....
            return { type: "repeat" };
        }

        if (!this.squad) {
            this.squad = new CombatSquad(gatherPoint);
        }

        // Squads have their own 'gather' logic which we may need to handle separately, but this should point them in the right direction.
        this.squad.onAiUpdate(gameApi, actionsApi, actionBatcher, playerData, mission, matchAwareness, logger);

        const centerOfMassDistance = mission.getCenterOfMass()?.distanceTo(gatherPoint) ?? Number.MAX_VALUE;
        const maxDistanceToCenterOfMass = mission.getMaxDistanceToCenterOfMass() ?? Number.MAX_VALUE;

        // Maybe we should use RelaxedStray but I think this will work for now.
        if (centerOfMassDistance < 10 && maxDistanceToCenterOfMass < mission.getUnitIds().length * 5) {
            return { type: "step" };
        }

        return { type: "repeat" };
    }
}
