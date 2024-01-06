// Meta-controller for forming and controlling missions.
// Missions are groups of zero or more units that aim to accomplish a particular goal.

import { ActionsApi, GameApi, PlayerData, UnitData, Vector2 } from "@chronodivide/game-api";
import {
    Mission,
    MissionAction,
    MissionActionDisband,
    MissionActionGrabFreeCombatants,
    MissionActionRequestSpecificUnits,
    MissionActionRequestUnits,
} from "./mission.js";
import { MatchAwareness } from "../awareness.js";
import { MissionFactory, createMissionFactories } from "./missionFactories.js";
import { ActionBatcher } from "./actionBatcher.js";
import { countBy } from "../common/utils.js";
import { MissionBehaviour } from "./missions/missionBehaviour.js";

type MissionWithAction<T extends MissionAction> = {
    mission: Mission<any>;
    action: T;
};

export class MissionController {
    private missionFactories: MissionFactory[];
    private missions: Mission<any>[] = [];

    // A mapping of unit IDs to the missions they are assigned to. This may contain units that are dead, but
    // is periodically cleaned in the update loop.
    private unitIdToMission: Map<number, Mission<any, any>> = new Map();

    private forceDisbandedMissions: string[] = [];

    constructor(private logger: (message: string, sayInGame?: boolean) => void) {
        this.missionFactories = createMissionFactories();
    }

    private resetUnitIdMap() {
        // Check for units in multiple missions, this shouldn't happen.
        this.unitIdToMission = new Map();
        this.missions.forEach((mission) => {
            mission.getUnitIds().forEach((unitId) => {
                if (this.unitIdToMission.has(unitId)) {
                    this.logger(`WARNING: unit ${unitId} is in multiple missions, please debug.`);
                } else {
                    this.unitIdToMission.set(unitId, mission);
                }
            });
        });
    }

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
    ) {
        // Remove inactive missions.
        this.missions = this.missions.filter((missions) => missions.isActive());

        this.resetUnitIdMap();

        // Batch actions to reduce spamming of actions for larger armies.
        const actionBatcher = new ActionBatcher();

        // Poll missions for requested actions.
        const missionActions: MissionWithAction<any>[] = this.missions.map((mission) => ({
            mission,
            action: mission.onAiUpdate(gameApi, actionsApi, playerData, matchAwareness, actionBatcher),
        }));

        // Handle disbands and merges.
        const isDisband = (a: MissionAction) => a.type == "disband";
        const disbandedMissions: Map<string, any> = new Map();
        const disbandedMissionsArray: { mission: Mission<any, any>; reason: any }[] = [];
        this.forceDisbandedMissions.forEach((name) => disbandedMissions.set(name, null));
        this.forceDisbandedMissions = [];
        missionActions
            .filter((a) => isDisband(a.action))
            .forEach((a) => {
                this.logger(`Mission ${a.mission.getUniqueName()} disbanding as requested.`);
                a.mission.getUnitIds().forEach((unitId) => {
                    this.unitIdToMission.delete(unitId);
                    actionsApi.setUnitDebugText(unitId, undefined);
                });
                disbandedMissions.set(a.mission.getUniqueName(), (a.action as MissionActionDisband).reason);
            });

        // Handle unit requests.

        // Request specific units by ID
        const isRequestSpecific = (a: MissionAction) => a.type === "requestSpecific";
        const unitIdToHighestRequest = missionActions
            .filter((a) => isRequestSpecific(a.action))
            .reduce(
                (prev, a) => {
                    const missionWithAction = a as MissionWithAction<MissionActionRequestSpecificUnits>;
                    const { unitIds } = missionWithAction.action;
                    unitIds.forEach((unitId) => {
                        if (prev.hasOwnProperty(unitId)) {
                            if (prev[unitId].action.priority > prev[unitId].action.priority) {
                                prev[unitId] = missionWithAction;
                            }
                        } else {
                            prev[unitId] = missionWithAction;
                        }
                    });
                    return prev;
                },
                {} as Record<number, MissionWithAction<MissionActionRequestSpecificUnits>>,
            );

        // Map of Mission ID to Unit Type to Count.
        const newMissionAssignments = Object.entries(unitIdToHighestRequest)
            .flatMap(([id, request]) => {
                const unitId = Number.parseInt(id);
                const unit = gameApi.getUnitData(unitId);
                const { mission: requestingMission } = request;
                const missionName = requestingMission.getUniqueName();
                if (!unit) {
                    this.logger(`mission ${missionName} requested non-existent unit ${unitId}`);
                    return [];
                }
                if (!this.unitIdToMission.has(unitId)) {
                    this.addUnitToMission(requestingMission, unit);
                    return [{ unitName: unit?.name, mission: requestingMission.getUniqueName() }];
                }
                return [];
            })
            .reduce(
                (acc, curr) => {
                    if (!acc[curr.mission]) {
                        acc[curr.mission] = {};
                    }
                    if (!acc[curr.mission][curr.unitName]) {
                        acc[curr.mission][curr.unitName] = 0;
                    }
                    acc[curr.mission][curr.unitName] = acc[curr.mission][curr.unitName] + 1;
                    return acc;
                },
                {} as Record<string, Record<string, number>>,
            );
        Object.entries(newMissionAssignments).forEach(([mission, assignments]) => {
            this.logger(
                `Mission ${mission} received: ${Object.entries(assignments)
                    .map(([unitType, count]) => unitType + " x " + count)
                    .join(", ")}`,
            );
        });

        // Request units by type
        const isRequest = (a: MissionAction) => a.type === "request";
        const unitTypeToHighestRequest = missionActions
            .filter((a) => isRequest(a.action))
            .reduce(
                (prev, a) => {
                    const missionWithAction = a as MissionWithAction<MissionActionRequestUnits>;
                    const { unitNames } = missionWithAction.action;
                    unitNames.forEach((unitName) => {
                        if (prev.hasOwnProperty(unitName)) {
                            if (prev[unitName].action.priority > prev[unitName].action.priority) {
                                prev[unitName] = missionWithAction;
                            }
                        } else {
                            prev[unitName] = missionWithAction;
                        }
                    });
                    return prev;
                },
                {} as Record<string, MissionWithAction<MissionActionRequestUnits>>,
            );

        // Request combat-capable units in an area
        const isGrab = (a: MissionAction) => a.type === "requestCombatants";
        const grabRequests = missionActions.filter((a) =>
            isGrab(a.action),
        ) as MissionWithAction<MissionActionGrabFreeCombatants>[];

        // Find loose units
        const unitIds = gameApi.getVisibleUnits(playerData.name, "self");
        const freeUnits = unitIds
            .map((unitId) => gameApi.getUnitData(unitId))
            .filter((unit) => !!unit && !this.unitIdToMission.has(unit.id || 0))
            .map((unit) => unit!);

        type AssignmentWithType = { unitName: string; missionName: string; method: "type" | "grab" };
        const newAssignmentsByType = freeUnits
            .flatMap((freeUnit) => {
                if (unitTypeToHighestRequest.hasOwnProperty(freeUnit.name)) {
                    const { mission: requestingMission } = unitTypeToHighestRequest[freeUnit.name];
                    this.logger(
                        `granting unit ${freeUnit.id}#${freeUnit.name} to mission ${requestingMission.getUniqueName()}`,
                    );
                    this.addUnitToMission(requestingMission, freeUnit);
                    delete unitTypeToHighestRequest[freeUnit.name];
                    return [
                        { unitName: freeUnit.name, missionName: requestingMission.getUniqueName(), method: "type" },
                    ] as AssignmentWithType[];
                } else if (grabRequests.length > 0) {
                    const grantedMission = grabRequests.find((request) => {
                        return (
                            freeUnit.rules.isSelectableCombatant &&
                            request.action.point.distanceTo(new Vector2(freeUnit.tile.rx, freeUnit.tile.ry)) <=
                                request.action.radius
                        );
                    });
                    if (grantedMission) {
                        this.addUnitToMission(grantedMission.mission, freeUnit);
                        return [
                            {
                                unitName: freeUnit.name,
                                missionName: grantedMission.mission.getUniqueName(),
                                method: "grab",
                            },
                        ] as AssignmentWithType[];
                    }
                }
                return [];
            })
            .reduce(
                (acc, curr) => {
                    if (!acc[curr.missionName]) {
                        acc[curr.missionName] = {};
                    }
                    if (!acc[curr.missionName][curr.unitName]) {
                        acc[curr.missionName][curr.unitName] = { grab: 0, type: 0 };
                    }
                    acc[curr.missionName][curr.unitName][curr.method] =
                        acc[curr.missionName][curr.unitName][curr.method] + 1;
                    return acc;
                },
                {} as Record<string, Record<string, Record<"type" | "grab", number>>>,
            );
        Object.entries(newAssignmentsByType).forEach(([mission, assignments]) => {
            this.logger(
                `Mission ${mission} received: ${Object.entries(assignments)
                    .flatMap(([unitType, methodToCount]) =>
                        Object.entries(methodToCount)
                            .filter(([, count]) => count > 0)
                            .map(([method, count]) => unitType + " x " + count + " (by " + method + ")"),
                    )
                    .join(", ")}`,
            );
        });

        actionBatcher.resolve(actionsApi);

        // Remove disbanded and merged missions.
        this.missions
            .filter((missions) => disbandedMissions.has(missions.getUniqueName()))
            .forEach((disbandedMission) => {
                const reason = disbandedMissions.get(disbandedMission.getUniqueName());
                this.logger(`mission disbanded: ${disbandedMission.getUniqueName()}, reason: ${reason}`);
                disbandedMissionsArray.push({ mission: disbandedMission, reason });
                disbandedMission.endMission(disbandedMissions.get(disbandedMission.getUniqueName()));
            });
        this.missions = this.missions.filter((missions) => !disbandedMissions.has(missions.getUniqueName()));

        // Create dynamic missions.
        this.missionFactories.forEach((missionFactory) => {
            missionFactory.maybeCreateMissions(gameApi, playerData, matchAwareness, this, this.logger);
            disbandedMissionsArray.forEach(({ reason, mission }) => {
                missionFactory.onMissionFailed(gameApi, playerData, matchAwareness, mission, reason, this, this.logger);
            });
        });
    }

    private addUnitToMission(mission: Mission<any, any>, unit: UnitData) {
        mission.addUnit(unit.id);
        this.unitIdToMission.set(unit.id, mission);
    }

    /**
     * Attempts to add a mission to the active set.
     * @param mission
     * @returns The mission if it was accepted, or null if it was not.
     */
    public addMission<T extends MissionBehaviour>(mission: Mission<T, any>): Mission<T, any> | null {
        if (this.missions.some((m) => m.getUniqueName() === mission.getUniqueName())) {
            // reject non-unique mission names
            return null;
        }
        this.logger(`Added mission: ${mission.getUniqueName()}`);
        this.missions.push(mission);
        return mission;
    }

    /**
     * Disband the provided mission on the next possible opportunity.
     */
    public disbandMission(missionName: string) {
        this.forceDisbandedMissions.push(missionName);
    }

    // return text to display for global debug
    public getGlobalDebugText(gameApi: GameApi): string {
        const unitsInMission = (unitIds: number[]) => countBy(unitIds, (unitId) => gameApi.getUnitData(unitId)?.name);

        let globalDebugText = "";

        this.missions.forEach((mission) => {
            this.logger(
                `Mission ${mission.getUniqueName()}: ${Object.entries(unitsInMission(mission.getUnitIds()))
                    .map(([unitName, count]) => `${unitName} x ${count}`)
                    .join(", ")}`,
            );
            const missionDebugText = mission.getGlobalDebugText();
            if (missionDebugText) {
                globalDebugText += mission.getUniqueName() + ": " + missionDebugText + "\n";
            }
        });
        return globalDebugText;
    }

    public updateDebugText(actionsApi: ActionsApi) {
        this.missions.forEach((mission) => {
            mission.getUnitIds().forEach((unitId) => actionsApi.setUnitDebugText(unitId, mission.getUniqueName()));
        });
    }
}
