import { GameApi, PlayerData } from "@chronodivide/game-api";
import { Squad } from "../squad/squad.js";
import { SquadBehaviour } from "../squad/squadBehaviour.js";
import { GlobalThreat } from "../threat/threat.js";
import { ExpansionMissionFactory } from "./expansionMission.js";

// AI starts Missions based on heuristics, which have one or more squads.
// Missions can create squads (but squads will disband themselves).
export interface Mission {
  onAiUpdate(
    gameApi: GameApi,
    playerData: PlayerData,
    threatData: GlobalThreat | undefined,
  ): MissionAction;

  isActive(): boolean;

  removeSquad(squad: Squad): void;

  addSquad(squad: Squad): void;

  getSquads(): Squad[];

  getUniqueName(): string;
}

export type MissionActionNoop = {
  type: "noop";
};
export type MissionActionCreateSquad = {
  type: "createSquad";
  name: string;
  behaviour: SquadBehaviour;
};
export type MissionActionDisband = {
  type: "disband";
};

export type MissionAction =
  | MissionActionNoop
  | MissionActionCreateSquad
  | MissionActionDisband;

export interface MissionFactory {
  // Potentially return a new mission.
  maybeCreateMission(
    gameApi: GameApi,
    playerData: PlayerData,
    threatData: GlobalThreat,
    existingMissions: Mission[],
  ): Mission | undefined;
}

export const missionFactories = [new ExpansionMissionFactory()];
