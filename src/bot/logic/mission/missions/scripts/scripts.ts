import { ActionsApi, GameApi, PlayerData } from "@chronodivide/game-api";
import { MatchAwareness } from "../../../awareness.js";
import { GuardAreaStep, ResolvedScriptTypeEntry, ScriptTypeAction } from "../triggers/scriptTypes.js";
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
    scriptStep: ResolvedScriptTypeEntry;
    gameApi: GameApi;
    mission: Mission<any>;
    actionsApi: ActionsApi;
    actionBatcher: ActionBatcher;
    playerData: PlayerData;
    matchAwareness: MatchAwareness;
    logger: DebugLogger;
};

export interface ScriptStepHandler {
    onStart?(args: OnStepArgs): void;

    onStep(args: OnStepArgs): ScriptStepResult;

    onCleanup?(args: OnStepArgs): void;
}

export const SCRIPT_STEP_HANDLERS = new Map<ScriptTypeAction, () => ScriptStepHandler>([
    [ScriptTypeAction.GuardArea, () => new GuardAreaHandler()],
    [ScriptTypeAction.GatherAtEnemyBase, () => new GatherOrRegroupHandler(GatherOrRegroup.Gather)],
    [ScriptTypeAction.RegroupAtFriendlyBase, () => new GatherOrRegroupHandler(GatherOrRegroup.Regroup)],
]);

/**
 * These need to be implemented:
   0 219 -> AttackQuarryType
   5 16 -> GuardArea
   6 3 -> JumpToLine
   8 12 -> Unload
   11 15 -> AssignNewMission
   14 13 -> LoadOntoTransport
   21 1 -> Scatter
   43 13 -> WaitUntilFullyLoaded
   46 35 -> AttackEnemyStructure
   47 27 -> MoveToEnemyStructure
   49 65 -> RegisterSuccess
   55 7 -> ActivateIronCurtainOnTaskForce
   57 2 -> ChronoshiftTaskForceToTargetType
   58 38 -> MoveToFriendlyStructure
 */

class GuardAreaHandler implements ScriptStepHandler {
    private endAt: number | null = null;

    private squad: CombatSquad | null = null;

    onStart({ scriptStep, gameApi }: OnStepArgs): void {
        const entry = scriptStep as GuardAreaStep;
        // there are 15 ticks per second at normal speed, and each unit of time in the step is 6 seconds (1/10 of a minute).
        // source: https://modenc.renegadeprojects.com/ScriptTypes/ScriptActions#fn3
        const guardTimeInFrames = entry.time * 6 * 15;
        this.endAt = gameApi.getCurrentTick() + guardTimeInFrames;
    }

    onStep({
        gameApi,
        mission,
        actionsApi,
        actionBatcher,
        playerData,
        matchAwareness,
        logger,
    }: OnStepArgs): ScriptStepResult {
        if (!this.endAt || gameApi.getCurrentTick() > this.endAt) {
            return { type: "step" };
        }

        const currentPoint = mission.getCenterOfMass();

        if (!currentPoint) {
            return { type: "disband" };
        }

        if (!this.squad) {
            this.squad = new CombatSquad(currentPoint);
        }

        this.squad.onAiUpdate(gameApi, actionsApi, actionBatcher, playerData, mission, matchAwareness, logger);

        return { type: "repeat" };
    }
}

enum GatherOrRegroup {
    Gather,
    Regroup,
}

class GatherOrRegroupHandler implements ScriptStepHandler {
    constructor(private mode: GatherOrRegroup) {}

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
        const targetPoint =
            this.mode === GatherOrRegroup.Gather
                ? matchAwareness.getEnemyGatherPoint()
                : matchAwareness.getMainRallyPoint();
        if (!targetPoint) {
            // Gather point may not exist at the start of the game, which is before any of these missions are created, but you never know....
            return { type: "repeat" };
        }

        if (!this.squad) {
            this.squad = new CombatSquad(targetPoint);
        }

        // Squads have their own 'gather' logic which we may need to handle separately, but this should point them in the right direction.
        this.squad.onAiUpdate(gameApi, actionsApi, actionBatcher, playerData, mission, matchAwareness, logger);

        const centerOfMassDistance = mission.getCenterOfMass()?.distanceTo(targetPoint) ?? Number.MAX_VALUE;
        const maxDistanceToCenterOfMass = mission.getMaxDistanceToCenterOfMass() ?? Number.MAX_VALUE;

        // Maybe we should use RelaxedStray but I think this will work for now.
        if (centerOfMassDistance < 10 && maxDistanceToCenterOfMass < mission.getUnitIds().length * 5) {
            return { type: "step" };
        }

        return { type: "repeat" };
    }
}
