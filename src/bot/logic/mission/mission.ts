import { ActionsApi, GameApi, PlayerData, Tile, UnitData, Vector2 } from "@chronodivide/game-api";
import { MatchAwareness } from "../awareness.js";
import { DebugLogger } from "../common/utils.js";
import { ActionBatcher } from "./actionBatcher.js";
import { getDistanceBetweenTileAndPoint } from "../map/map.js";

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
// AI starts Missions based on heuristics.
export abstract class Mission<FailureReasons = undefined> {
    private active = true;
    private unitIds: number[] = [];
    private centerOfMass: Vector2 | null = null;
    private maxDistanceToCenterOfMass: number | null = null;

    private onFinish: (unitIds: number[], reason: FailureReasons) => void = () => {};

    constructor(
        private uniqueName: string,
        protected logger: DebugLogger,
    ) {}

    // TODO call this
    protected updateCenterOfMass(gameApi: GameApi) {
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
    }

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction {
        this.updateCenterOfMass(gameApi);
        return this._onAiUpdate(gameApi, actionsApi, playerData, matchAwareness, actionBatcher);
    }

    // TODO: fix this weird indirection
    abstract _onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        actionBatcher: ActionBatcher,
    ): MissionAction;

    isActive(): boolean {
        return this.active;
    }

    public getUnitIds(): number[] {
        return this.unitIds;
    }

    public removeUnit(unitIdToRemove: number): void {
        this.unitIds = this.unitIds.filter((unitId) => unitId != unitIdToRemove);
    }

    public addUnit(unitIdToAdd: number): void {
        this.unitIds.push(unitIdToAdd);
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

    public getCenterOfMass() {
        return this.centerOfMass;
    }

    public getMaxDistanceToCenterOfMass() {
        return this.maxDistanceToCenterOfMass;
    }

    getUniqueName(): string {
        return this.uniqueName;
    }

    // Don't call this from the mission itself
    endMission(reason: FailureReasons): void {
        this.onFinish(this.unitIds, reason);
        this.active = false;
    }

    /**
     * Declare a callback that is executed when the mission is disbanded for whatever reason.
     */
    then(onFinish: (unitIds: number[], reason: FailureReasons) => void): Mission<FailureReasons> {
        this.onFinish = onFinish;
        return this;
    }

    abstract getGlobalDebugText(): string | undefined;

    /**
     * Determines whether units can be stolen from this mission by other missions with higher priority.
     */
    public isUnitsLocked(): boolean {
        return true;
    }

    abstract getPriority(): number;
}

export type MissionWithAction<T extends MissionAction> = {
    mission: Mission<any>;
    action: T;
};

export type MissionActionNoop = {
    type: "noop";
};

export type MissionActionDisband = {
    type: "disband";
    reason: any | null;
};

export type MissionActionRequestUnits = {
    type: "request";
    unitNames: string[];
    priority: number;
};

export type MissionActionRequestSpecificUnits = {
    type: "requestSpecific";
    unitIds: number[];
    priority: number;
};

export type MissionActionGrabFreeCombatants = {
    type: "requestCombatants";
    point: Vector2;
    radius: number;
};

export type MissionActionReleaseUnits = {
    type: "releaseUnits";
    unitIds: number[];
};

export const noop = () =>
    ({
        type: "noop",
    }) as MissionActionNoop;

export const disbandMission = (reason?: any) => ({ type: "disband", reason }) as MissionActionDisband;
export const isDisbandMission = (a: MissionWithAction<MissionAction>): a is MissionWithAction<MissionActionDisband> =>
    a.action.type === "disband";

export const requestUnits = (unitNames: string[], priority: number) =>
    ({ type: "request", unitNames, priority }) as MissionActionRequestUnits;
export const isRequestUnits = (
    a: MissionWithAction<MissionAction>,
): a is MissionWithAction<MissionActionRequestUnits> => a.action.type === "request";

export const requestSpecificUnits = (unitIds: number[], priority: number) =>
    ({ type: "requestSpecific", unitIds, priority }) as MissionActionRequestSpecificUnits;
export const isRequestSpecificUnits = (
    a: MissionWithAction<MissionAction>,
): a is MissionWithAction<MissionActionRequestSpecificUnits> => a.action.type === "requestSpecific";

export const grabCombatants = (point: Vector2, radius: number) =>
    ({ type: "requestCombatants", point, radius }) as MissionActionGrabFreeCombatants;
export const isGrabCombatants = (
    a: MissionWithAction<MissionAction>,
): a is MissionWithAction<MissionActionGrabFreeCombatants> => a.action.type === "requestCombatants";

export const releaseUnits = (unitIds: number[]) => ({ type: "releaseUnits", unitIds }) as MissionActionReleaseUnits;
export const isReleaseUnits = (
    a: MissionWithAction<MissionAction>,
): a is MissionWithAction<MissionActionReleaseUnits> => a.action.type === "releaseUnits";

export type MissionAction =
    | MissionActionNoop
    | MissionActionDisband
    | MissionActionRequestUnits
    | MissionActionRequestSpecificUnits
    | MissionActionGrabFreeCombatants
    | MissionActionReleaseUnits;
