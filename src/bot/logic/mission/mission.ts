import { GameApi, PlayerData } from "@chronodivide/game-api";
import { Squad } from "../squad/squad.js";
import { GlobalThreat } from "../threat/threat.js";

// AI starts Missions based on heuristics, which have one or more squads.
// Missions can create squads (but squads will disband themselves).
export abstract class Mission {
    constructor(private uniqueName: string, private priority: number = 1, private squad: Squad | null = null) {}

    abstract onAiUpdate(gameApi: GameApi, playerData: PlayerData, threatData: GlobalThreat | undefined): MissionAction;

    isActive(): boolean {
        return true;
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

export const disbandMission = () => ({ type: "disband" } as MissionActionDisband);

export type MissionAction = MissionActionNoop | MissionActionRegisterSquad | MissionActionDisband;
