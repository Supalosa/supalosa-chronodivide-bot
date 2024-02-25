import { ActionsApi, GameApi, PlayerData, UnitData } from "@chronodivide/game-api";
import { CombatSquad } from "./squads/combatSquad.js";
import { Mission, MissionAction, disbandMission, noop, requestUnits } from "../mission.js";
import { MatchAwareness } from "../../awareness.js";
import { DebugLogger, countBy, isOwnedByNeutral } from "../../common/utils.js";
import { ActionBatcher } from "../actionBatcher.js";
import { UnitComposition } from "../../composition/common.js";
import { manageMoveMicro } from "./squads/common.js";
import { GeneralAiRules, ResolvedTeamType } from "./triggers/triggerManager.js";

export enum ScriptEndedReason {}

enum ScriptMissionState {
    Filling = 0,
    Ready = 1,
}

const MISSION_PRIORITY_RAMP = 1.01;
const MISSION_MAX_PRIORITY = 50;

/**
 * A mission that follows a script from the ai.ini file.
 */
export class ScriptedTeamMission extends Mission<ScriptEndedReason> {
    private dissolveUnfulfilledAt: number | null = null;

    private state: ScriptMissionState = ScriptMissionState.Filling;
    private priority: number;

    constructor(
        uniqueName: string,
        private teamType: ResolvedTeamType,
        private generalRules: GeneralAiRules,
        logger: DebugLogger,
    ) {
        super(uniqueName, logger);
        this.priority = teamType.priority;
    }

    _onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction {
        if (this.dissolveUnfulfilledAt === null) {
            this.dissolveUnfulfilledAt = gameApi.getCurrentTick() + this.generalRules.dissolveUnfilledTeamDelay;
        }

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
        const currentComposition: UnitComposition = countBy(this.getUnitsGameObjectData(gameApi), (unit) => unit.name);

        const missingUnits = Object.entries(this.teamType.taskForce.units).filter(([unitType, targetAmount]) => {
            return !currentComposition[unitType] || currentComposition[unitType] < targetAmount;
        });

        if (this.dissolveUnfulfilledAt && gameApi.getCurrentTick() > this.dissolveUnfulfilledAt) {
            return disbandMission();
        }

        if (missingUnits.length > 0) {
            this.priority = Math.min(this.priority * MISSION_PRIORITY_RAMP, MISSION_MAX_PRIORITY);
            return requestUnits(
                missingUnits.map(([unitName]) => unitName),
                this.priority,
            );
        } else {
            this.priority = this.teamType.priority;
            this.state = ScriptMissionState.Ready;
            return noop();
        }
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
