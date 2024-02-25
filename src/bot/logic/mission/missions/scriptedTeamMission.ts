import { ActionsApi, GameApi, PlayerData, UnitData } from "@chronodivide/game-api";
import { CombatSquad } from "./squads/combatSquad.js";
import { Mission, MissionAction, disbandMission, noop, requestUnits } from "../mission.js";
import { MatchAwareness } from "../../awareness.js";
import { DebugLogger, countBy, isOwnedByNeutral } from "../../common/utils.js";
import { ActionBatcher } from "../actionBatcher.js";
import { UnitComposition } from "../../composition/common.js";
import { manageMoveMicro } from "./squads/common.js";
import { ResolvedTeamType } from "./triggers/triggerManager.js";

export enum ScriptEndedReason {}

enum ScriptMissionState {
    Filling = 0,
    Ready = 1,
}
const ATTACK_MISSION_PRIORITY_RAMP = 1.01;
const ATTACK_MISSION_MAX_PRIORITY = 50;

/**
 * A mission that follows a script from the ai.ini file.
 */
export class ScriptedTeamMission extends Mission<ScriptEndedReason> {
    private state: ScriptMissionState = ScriptMissionState.Filling;

    constructor(
        uniqueName: string,
        private priority: number,
        private teamType: ResolvedTeamType,
        logger: DebugLogger,
    ) {
        super(uniqueName, logger);
    }

    _onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction {
        switch (this.state) {
            case ScriptMissionState.Filling:
                return this.handlePreparingState(gameApi, actionsApi, playerData, matchAwareness, actionBatcher);
            case ScriptMissionState.Ready:
                return this.handleAttackingState(gameApi, actionsApi, playerData, matchAwareness, actionBatcher);
        }
    }

    private handlePreparingState(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ) {
        return noop();
    }

    private handleAttackingState(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ) {
        return noop();
    }

    public getGlobalDebugText(): string | undefined {
        return "<none>";
    }

    public getState() {
        return this.state;
    }

    // This mission can give up its units while preparing.
    public isUnitsLocked(): boolean {
        return this.state !== ScriptMissionState.Filling;
    }

    public getPriority() {
        return this.priority;
    }
}
