import { Mission } from "./mission.js";
import { Vector2 } from "@chronodivide/game-api";

// Base mission action interface
export interface MissionAction {
    type: string;
    priority: number;
}

// Empty action
export interface MissionActionNoop extends MissionAction {
    type: "noop";
}

// Action to request unit types
export interface MissionActionRequestUnitTypes extends MissionAction {
    type: "requestUnitTypes";
    unitTypes: Record<string, number>;
}

// Action to release units
export interface MissionActionReleaseUnits extends MissionAction {
    type: "releaseUnits";
    unitIds: number[];
}

// Action to request specific units
export interface MissionActionRequestSpecificUnits extends MissionAction {
    type: "requestSpecificUnits";
    unitIds: number[];
}

// Action to move to target point
export interface MissionActionMoveToPoint extends MissionAction {
    type: "moveToPoint";
    targetPoint: Vector2;
}

// Combination of mission and action
export interface MissionWithAction<T extends MissionAction> {
    mission: Mission;
    action: T;
}

// Type guard function
export function isReleaseUnits(
    missionWithAction: MissionWithAction<MissionAction>
): missionWithAction is MissionWithAction<MissionActionReleaseUnits> {
    return missionWithAction.action.type === "releaseUnits";
}

export function isRequestUnitTypes(
    missionWithAction: MissionWithAction<MissionAction>
): missionWithAction is MissionWithAction<MissionActionRequestUnitTypes> {
    return missionWithAction.action.type === "requestUnitTypes";
}

export function isRequestSpecificUnits(
    missionWithAction: MissionWithAction<MissionAction>
): missionWithAction is MissionWithAction<MissionActionRequestSpecificUnits> {
    return missionWithAction.action.type === "requestSpecificUnits";
}

export function isGrabUnits(
    missionWithAction: MissionWithAction<MissionAction>
): missionWithAction is MissionWithAction<MissionActionMoveToPoint> {
    return missionWithAction.action.type === "moveToPoint";
} 