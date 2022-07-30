import { GameApi, PlayerData, TechnoRules, UnitData } from "@chronodivide/game-api";
import { SquadAction, SquadBehaviour } from "./squadBehaviour";

export enum SquadLiveness {
    SquadDead,
    SquadForming,
    SquadActive
}

export type SquadConstructionRequest = {
    squad: Squad,
    unitType: TechnoRules,
    priority: number
    // quantity: number
}

export class Squad {
    
    constructor(
        private name: string,
        private unitIds: number[],
        private liveness: SquadLiveness = SquadLiveness.SquadForming,
        private lastLivenessUpdateTick: number,
        private behaviour: SquadBehaviour,
    ) {}

    public getName() : string {
        return this.name;
    }

    public onAiUpdate(gameApi: GameApi, playerData: PlayerData): SquadAction {
        this.updateLiveness(gameApi);
        let outcome = this.behaviour.onAiUpdate(gameApi, playerData, this);
        return outcome;
    }

    public getUnitIds(): number[] {
        return this.unitIds;
    }

    public getUnits(gameApi: GameApi): UnitData[] {
        return this.unitIds.map(unitId => gameApi.getUnitData(unitId)).filter(unit => unit != null).map(unit => unit!);
    }

    public removeUnit(unitIdToRemove: number): void {
        this.unitIds = this.unitIds.filter(unitId => unitId != unitIdToRemove);
    }

    public clearUnits(): void {
        this.unitIds = [];
    }

    public addUnit(unitIdToAdd: number): void {
        this.unitIds.push(unitIdToAdd);
    }

    private updateLiveness(gameApi: GameApi) {
        this.unitIds = this.unitIds.filter(unitId => gameApi.getUnitData(unitId));
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