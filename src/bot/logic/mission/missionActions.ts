import { Mission } from "./mission.js";
import { Vector2 } from "@chronodivide/game-api";

// 基础任务动作接口
export interface MissionAction {
    type: string;
    priority: number;
}

// 空动作
export interface MissionActionNoop extends MissionAction {
    type: "noop";
}

// 请求单位类型的动作
export interface MissionActionRequestUnitTypes extends MissionAction {
    type: "requestUnitTypes";
    unitTypes: Record<string, number>;
}

// 释放单位的动作
export interface MissionActionReleaseUnits extends MissionAction {
    type: "releaseUnits";
    unitIds: number[];
}

// 请求特定单位的动作
export interface MissionActionRequestSpecificUnits extends MissionAction {
    type: "requestSpecificUnits";
    unitIds: number[];
}

// 移动到目标点的动作
export interface MissionActionMoveToPoint extends MissionAction {
    type: "moveToPoint";
    targetPoint: Vector2;
}

// 任务与动作的组合
export interface MissionWithAction<T extends MissionAction> {
    mission: Mission;
    action: T;
}

// 类型守卫函数
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