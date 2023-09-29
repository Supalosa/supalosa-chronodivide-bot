import {
  GameApi,
  PlayerData,
  TechnoRules,
  UnitData,
} from "@chronodivide/game-api";
import { Mission } from "../mission/mission.js";
import { GlobalThreat } from "../threat/threat.js";
import { SquadAction, SquadBehaviour } from "./squadBehaviour.js";

export enum SquadLiveness {
  SquadDead,
  SquadActive,
}

export type SquadConstructionRequest = {
  squad: Squad;
  unitType: TechnoRules;
  priority: number;
  // quantity: number
};

export class Squad {
  constructor(
    private name: string,
    private behaviour: SquadBehaviour,
    private mission: Mission | undefined,
    private unitIds: number[] = [],
    private liveness: SquadLiveness = SquadLiveness.SquadActive,
    private lastLivenessUpdateTick: number = 0,
  ) {}

  public getName(): string {
    return this.name;
  }

  public onAiUpdate(
    gameApi: GameApi,
    playerData: PlayerData,
    threatData: GlobalThreat | undefined,
  ): SquadAction {
    this.updateLiveness(gameApi);
    if (this.mission && this.mission.isActive() == false) {
      // Orphaned squad, might get picked up later.
      this.mission.removeSquad(this);
      this.mission = undefined;
    }
    let outcome = this.behaviour.onAiUpdate(
      gameApi,
      playerData,
      this,
      threatData,
    );
    return outcome;
  }

  public getMission(): Mission | undefined {
    return this.mission;
  }

  public setMission(mission: Mission | undefined) {
    if (this.mission != undefined && this.mission != mission) {
      this.mission.removeSquad(this);
    }
    this.mission = mission;
  }

  public getUnitIds(): number[] {
    return this.unitIds;
  }

  public getUnits(gameApi: GameApi): UnitData[] {
    return this.unitIds
      .map((unitId) => gameApi.getUnitData(unitId))
      .filter((unit) => unit != null)
      .map((unit) => unit!);
  }

  public getUnitsOfType(
    gameApi: GameApi,
    f: (r: UnitData | undefined) => boolean,
  ): UnitData[] {
    return this.unitIds
      .map((unitId) => gameApi.getUnitData(unitId))
      .filter(f)
      .map((unit) => unit!);
  }

  public removeUnit(unitIdToRemove: number): void {
    this.unitIds = this.unitIds.filter((unitId) => unitId != unitIdToRemove);
  }

  public clearUnits(): void {
    this.unitIds = [];
  }

  public addUnit(unitIdToAdd: number): void {
    this.unitIds.push(unitIdToAdd);
  }

  private updateLiveness(gameApi: GameApi) {
    this.unitIds = this.unitIds.filter((unitId) => gameApi.getUnitData(unitId));
    this.lastLivenessUpdateTick = gameApi.getCurrentTick();
    if (this.unitIds.length == 0) {
      if (this.liveness == SquadLiveness.SquadActive) {
        this.liveness = SquadLiveness.SquadDead;
      }
    }
  }

  public getLiveness() {
    return this.liveness;
  }
}
