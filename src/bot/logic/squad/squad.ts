import { ActionsApi, GameApi, PlayerData, TechnoRules, Tile, UnitData, Vector2 } from "@chronodivide/game-api";
import { Mission } from "../mission/mission.js";
import { SquadAction, SquadBehaviour, disband } from "./squadBehaviour.js";
import { MatchAwareness } from "../awareness.js";
import { getDistanceBetweenTileAndPoint } from "../map/map.js";
import { DebugLogger } from "../common/utils.js";

export enum SquadLiveness {
    SquadDead,
    SquadActive,
}

export type SquadConstructionRequest = {
    squad: Squad;
    unitType: TechnoRules;
    priority: number;
};

const calculateCenterOfMass: (unitTiles: Tile[]) => {
    centerOfMass: Vector2;
    maxDistance: number;
} | null = (unitTiles) => {
    if (unitTiles.length === 0) {
        return null;
    }
    // TODO: use median here
    const sums = unitTiles.reduce(
        ({ x, y }, tile) => {
            return {
                x: x + (tile?.rx || 0),
                y: y + (tile?.ry || 0),
            };
        },
        { x: 0, y: 0 },
    );
    const centerOfMass = new Vector2(Math.round(sums.x / unitTiles.length), Math.round(sums.y / unitTiles.length));

    // max distance of units to the center of mass
    const distances = unitTiles.map((tile) => getDistanceBetweenTileAndPoint(tile, centerOfMass));
    const maxDistance = Math.max(...distances);
    return { centerOfMass, maxDistance };
};

export class Squad {
    private unitIds: number[] = [];
    private liveness: SquadLiveness = SquadLiveness.SquadActive;
    private lastLivenessUpdateTick: number = 0;
    private centerOfMass: Vector2 | null = null;
    private maxDistanceToCenterOfMass: number | null = null;

    constructor(
        private name: string,
        private behaviour: SquadBehaviour,
        private mission: Mission<any> | null,
        private killable = false,
    ) {}

    public getName(): string {
        return this.name;
    }

    public getCenterOfMass() {
        return this.centerOfMass;
    }

    public getMaxDistanceToCenterOfMass() {
        return this.maxDistanceToCenterOfMass;
    }

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        logger: DebugLogger,
    ): SquadAction {
        this.updateLiveness(gameApi);
        const movableUnitTiles = this.unitIds
            .map((unitId) => gameApi.getUnitData(unitId))
            .filter((unit) => unit?.canMove)
            .map((unit) => unit?.tile)
            .filter((tile) => !!tile) as Tile[];
        const tileMetrics = calculateCenterOfMass(movableUnitTiles);
        if (tileMetrics) {
            this.centerOfMass = tileMetrics.centerOfMass;
            this.maxDistanceToCenterOfMass = tileMetrics.maxDistance;
        } else {
            this.centerOfMass = null;
            this.maxDistanceToCenterOfMass = null;
        }

        if (this.mission && this.mission.isActive() == false) {
            // Orphaned squad, might get picked up later.
            this.mission.removeSquad();
            this.mission = null;
            return disband();
        } else if (!this.mission) {
            return disband();
        }
        return this.behaviour.onAiUpdate(gameApi, actionsApi, playerData, this, matchAwareness, logger);
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
