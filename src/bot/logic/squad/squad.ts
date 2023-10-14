import { ActionsApi, GameApi, PlayerData, TechnoRules, UnitData } from "@chronodivide/game-api";
import { Mission } from "../mission/mission.js";
import { GlobalThreat } from "../threat/threat.js";
import { SquadAction, SquadBehaviour, disband } from "./squadBehaviour.js";
import { MatchAwareness } from "../awareness.js";

export enum SquadLiveness {
    SquadDead,
    SquadActive,
}

export type SquadConstructionRequest = {
    squad: Squad;
    unitType: TechnoRules;
    priority: number;
};

export class Squad {
    private unitIds: number[] = [];
    private liveness: SquadLiveness = SquadLiveness.SquadActive;
    private lastLivenessUpdateTick: number = 0;

    constructor(
        private name: string,
        private behaviour: SquadBehaviour,
        private mission: Mission<any> | null,
        private killable = false
    ) {}

    public getName(): string {
        return this.name;
    }

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness
    ): SquadAction {
        this.updateLiveness(gameApi);
        if (this.mission && this.mission.isActive() == false) {
            // Orphaned squad, might get picked up later.
            this.mission.removeSquad();
            this.mission = null;
            return disband();
        } else if (!this.mission) {
            return disband();
        }
        let outcome = this.behaviour.onAiUpdate(gameApi, actionsApi, playerData, this, matchAwareness);
        return outcome;
    }
    public getMission(): Mission | null {
        return this.mission;
    }

    public setMission(mission: Mission | null) {
        if (this.mission != undefined && this.mission != mission) {
            this.mission.removeSquad();
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

    public getUnitsOfTypes(gameApi: GameApi, ...names: string[]): UnitData[] {
        return this.unitIds
            .map((unitId) => gameApi.getUnitData(unitId))
            .filter((unit) => !!unit && names.includes(unit.name))
            .map((unit) => unit!);
    }

    public getUnitsMatching(gameApi: GameApi, filter: (r: UnitData) => boolean): UnitData[] {
        return this.unitIds
            .map((unitId) => gameApi.getUnitData(unitId))
            .filter((unit) => !!unit && filter(unit))
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
        if (this.killable && this.unitIds.length == 0) {
            if (this.liveness == SquadLiveness.SquadActive) {
                this.liveness = SquadLiveness.SquadDead;
            }
        }
    }

    public getLiveness() {
        return this.liveness;
    }
}
