import { GameApi, PlayerData } from "@chronodivide/game-api";
import { Squad } from "../squad/squad.js";
import { GlobalThreat } from "../threat/threat.js";
import { MatchAwareness } from "../awareness.js";
import { DebugLogger } from "../common/utils.js";

// AI starts Missions based on heuristics, which have one or more squads.
// Missions can create squads (but squads will disband themselves).
export abstract class Mission<FailureReasons = undefined> {
    private squad: Squad | null = null;
    private active = true;

    private onFinish: (reason: FailureReasons, squad: Squad | null) => void = () => {};

    constructor(private uniqueName: string, private priority: number, protected logger: DebugLogger) {}

    abstract onAiUpdate(gameApi: GameApi, playerData: PlayerData, matchAwareness: MatchAwareness): MissionAction;

    isActive(): boolean {
        return this.active;
    }

    protected setSquad(squad: Squad): MissionActionRegisterSquad {
        this.squad = squad;
        return registerSquad(squad);
    }

    getSquad(): Squad | null {
        return this.squad;
    }

    removeSquad() {
        // The squad was removed from this mission.
        this.squad = null;
    }

    getUniqueName(): string {
        return this.uniqueName;
    }

    // Don't call this from the mission itself
    endMission(reason: FailureReasons): void {
        this.onFinish(reason, this.squad);
        this.squad = null;
        this.active = false;
    }

    /**
     * Declare a callback that is executed when the mission is disbanded for whatever reason.
     */
    then(onFinish: (reason: FailureReasons, squad: Squad | null) => void): Mission<FailureReasons> {
        this.onFinish = onFinish;
        return this;
    }
}

export type MissionActionNoop = {
    type: "noop";
};

export type MissionActionRegisterSquad = {
    type: "registerSquad";
    squad: Squad;
};

export type MissionActionDisband = {
    type: "disband";
    reason: any | null;
};

export const noop = () =>
    ({
        type: "noop",
    } as MissionActionNoop);

export const registerSquad = (squad: Squad) =>
    ({
        type: "registerSquad",
        squad,
    } as MissionActionRegisterSquad);

export const disbandMission = (reason?: any) => ({ type: "disband", reason } as MissionActionDisband);

export type MissionAction = MissionActionNoop | MissionActionRegisterSquad | MissionActionDisband;
