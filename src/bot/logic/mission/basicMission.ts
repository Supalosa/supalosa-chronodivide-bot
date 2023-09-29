import { GameApi, PlayerData } from "@chronodivide/game-api";
import { Squad } from "../squad/squad.js";
import { GlobalThreat } from "../threat/threat.js";
import {
  Mission,
  MissionAction,
  MissionActionNoop,
  MissionFactory,
} from "./mission.js";

// A basic mission requests specific units and does nothing with them. It is not recommended
// to actually create this in a game as they'll just sit around idle.
export class BasicMission implements Mission {
  constructor(
    private uniqueName: string,
    private priority: number = 1,
    private squads: Squad[] = [],
  ) {}

  getUniqueName(): string {
    return this.uniqueName;
  }

  isActive(): boolean {
    return true;
  }

  removeSquad(squad: Squad): void {
    this.squads = this.squads.filter((s) => s != squad);
  }

  addSquad(squad: Squad): void {
    if (!this.squads.find((s) => s == squad)) {
      this.squads.push(squad);
    }
  }

  getSquads(): Squad[] {
    return this.squads;
  }

  onAiUpdate(
    gameApi: GameApi,
    playerData: PlayerData,
    threatData: GlobalThreat,
  ): MissionAction {
    return {} as MissionActionNoop;
  }

  onSquadAdded(
    gameApi: GameApi,
    playerData: PlayerData,
    threatData: GlobalThreat,
  ): void {}
}
