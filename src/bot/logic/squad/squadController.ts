// Meta-controller for forming and controlling squads.

import { ActionsApi, GameApi, PlayerData, UnitData } from "@chronodivide/game-api";
import { Squad, SquadLiveness } from "./squad.js";
import {
    SquadAction,
    SquadActionDisband,
    SquadActionGrabFreeCombatants,
    SquadActionMergeInto,
    SquadActionRequestSpecificUnits,
    SquadActionRequestUnits,
} from "./squadBehaviour.js";
import { MatchAwareness } from "../awareness.js";
import { getDistanceBetween } from "../map/map.js";
import countBy from "lodash.countby";

type SquadWithAction<T> = {
    squad: Squad;
    action: T;
};

export class SquadController {
    private squads: Squad[] = [];
    private unitIdToSquad: Map<number, Squad> = new Map();

    constructor(private logger: (message: string, sayInGame?: boolean) => void) {}

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
    ) {
        // Remove dead squads or those where the mission is dead.
        this.squads = this.squads.filter((squad) => squad.getLiveness() !== SquadLiveness.SquadDead);
        this.squads.sort((a, b) => a.getName().localeCompare(b.getName()));

        // Check for units in multiple squads, this shouldn't happen.
        this.unitIdToSquad = new Map();
        this.squads.forEach((squad) => {
            squad.getUnitIds().forEach((unitId) => {
                if (this.unitIdToSquad.has(unitId)) {
                    this.logger(`WARNING: unit ${unitId} is in multiple squads, please debug.`);
                } else {
                    this.unitIdToSquad.set(unitId, squad);
                }
            });
        });

        const squadActions: SquadWithAction<SquadAction>[] = this.squads.map((squad) => {
            return {
                squad,
                action: squad.onAiUpdate(gameApi, actionsApi, playerData, matchAwareness, this.logger),
            };
        });
        // Handle disbands and merges.
        const isDisband = (a: SquadAction): a is SquadActionDisband => a.type === "disband";
        const isMerge = (a: SquadAction): a is SquadActionMergeInto => a.type === "mergeInto";
        let disbandedSquads: Set<string> = new Set();
        squadActions
            .filter((a) => isDisband(a.action))
            .forEach((a) => {
                this.logger(`Squad ${a.squad.getName()} disbanding as requested.`);
                a.squad.getMission()?.removeSquad();
                a.squad.getUnitIds().forEach((unitId) => {
                    this.unitIdToSquad.delete(unitId);
                });
                disbandedSquads.add(a.squad.getName());
            });
        squadActions
            .filter((a) => isMerge(a.action))
            .forEach((a) => {
                let mergeInto = a.action as SquadActionMergeInto;
                if (disbandedSquads.has(mergeInto.mergeInto.getName())) {
                    this.logger(
                        `Squad ${a.squad.getName()} tried to merge into disbanded squad ${mergeInto.mergeInto.getName()}, cancelling.`,
                    );
                    return;
                }
                a.squad.getUnitIds().forEach((unitId) => mergeInto.mergeInto.addUnit(unitId));
                disbandedSquads.add(a.squad.getName());
            });
        // remove disbanded and merged squads.
        this.squads = this.squads.filter((squad) => !disbandedSquads.has(squad.getName()));

        // Request specific units by ID
        const isRequestSpecific = (a: SquadAction) => a.type === "requestSpecific";
        const unitIdToHighestRequest = squadActions
            .filter((a) => isRequestSpecific(a.action))
            .reduce(
                (prev, a) => {
                    const squadWithAction = a as SquadWithAction<SquadActionRequestSpecificUnits>;
                    const { unitIds } = squadWithAction.action;
                    unitIds.forEach((unitId) => {
                        if (prev.hasOwnProperty(unitId)) {
                            if (prev[unitId].action.priority > prev[unitId].action.priority) {
                                prev[unitId] = squadWithAction;
                            }
                        } else {
                            prev[unitId] = squadWithAction;
                        }
                    });
                    return prev;
                },
                {} as Record<number, SquadWithAction<SquadActionRequestSpecificUnits>>,
            );

        // Map of Squad ID to Unit Type to Count.
        const newSquadAssignments = Object.entries(unitIdToHighestRequest)
            .flatMap(([id, request]) => {
                const unitId = Number.parseInt(id);
                const unit = gameApi.getUnitData(unitId);
                const { squad: requestingSquad } = request;
                const missionName = requestingSquad.getMission()?.getUniqueName();
                if (!unit) {
                    this.logger(`mission ${missionName} requested non-existent unit ${unitId}`);
                    return [];
                }
                if (!this.unitIdToSquad.has(unitId)) {
                    this.addUnitToSquad(requestingSquad, unit);
                    return [{ unitName: unit?.name, squad: requestingSquad.getName() }];
                }
                return [];
            })
            .reduce(
                (acc, curr) => {
                    if (!acc[curr.squad]) {
                        acc[curr.squad] = {};
                    }
                    if (!acc[curr.squad][curr.unitName]) {
                        acc[curr.squad][curr.unitName] = 0;
                    }
                    acc[curr.squad][curr.unitName] = acc[curr.squad][curr.unitName] + 1;
                    return acc;
                },
                {} as Record<string, Record<string, number>>,
            );
        Object.entries(newSquadAssignments).forEach(([squad, assignments]) => {
            this.logger(
                `Squad ${squad} received: ${Object.entries(assignments)
                    .map(([unitType, count]) => unitType + " x " + count)
                    .join(", ")}`,
            );
        });

        // Request units by type
        const isRequest = (a: SquadAction) => a.type === "request";
        const unitTypeToHighestRequest = squadActions
            .filter((a) => isRequest(a.action))
            .reduce(
                (prev, a) => {
                    const squadWithAction = a as SquadWithAction<SquadActionRequestUnits>;
                    const { unitNames } = squadWithAction.action;
                    unitNames.forEach((unitName) => {
                        if (prev.hasOwnProperty(unitName)) {
                            if (prev[unitName].action.priority > prev[unitName].action.priority) {
                                prev[unitName] = squadWithAction;
                            }
                        } else {
                            prev[unitName] = squadWithAction;
                        }
                    });
                    return prev;
                },
                {} as Record<string, SquadWithAction<SquadActionRequestUnits>>,
            );

        // Request combat-capable units in an area
        const isGrab = (a: SquadAction) => a.type === "requestCombatants";
        const grabRequests = squadActions.filter((a) =>
            isGrab(a.action),
        ) as SquadWithAction<SquadActionGrabFreeCombatants>[];

        // Find loose units
        const unitIds = gameApi.getVisibleUnits(playerData.name, "self");
        const freeUnits = unitIds
            .map((unitId) => gameApi.getUnitData(unitId))
            .filter((unit) => !!unit && !this.unitIdToSquad.has(unit.id || 0))
            .map((unit) => unit!);

        type AssignmentWithType = { unitName: string; squad: string; method: "type" | "grab" };
        // [squadName][unitName]['type' | 'grab']
        const newAssignmentsByType = freeUnits
            .flatMap((freeUnit) => {
                if (unitTypeToHighestRequest.hasOwnProperty(freeUnit.name)) {
                    const { squad: requestingSquad } = unitTypeToHighestRequest[freeUnit.name];
                    this.logger(`granting unit ${freeUnit.id}#${freeUnit.name} to squad ${requestingSquad.getName()}`);
                    this.addUnitToSquad(requestingSquad, freeUnit);
                    delete unitTypeToHighestRequest[freeUnit.name];
                    return [
                        { unitName: freeUnit.name, squad: requestingSquad.getName(), method: "type" },
                    ] as AssignmentWithType[];
                } else if (grabRequests.length > 0) {
                    const grantedSquad = grabRequests.find((request) => {
                        return (
                            freeUnit.rules.isSelectableCombatant &&
                            getDistanceBetween(freeUnit, request.action.point) <= request.action.radius
                        );
                    });
                    if (grantedSquad) {
                        this.addUnitToSquad(grantedSquad.squad, freeUnit);
                        return [
                            { unitName: freeUnit.name, squad: grantedSquad.squad.getName(), method: "grab" },
                        ] as AssignmentWithType[];
                    }
                }
                return [];
            })
            .reduce(
                (acc, curr) => {
                    if (!acc[curr.squad]) {
                        acc[curr.squad] = {};
                    }
                    if (!acc[curr.squad][curr.unitName]) {
                        acc[curr.squad][curr.unitName] = { grab: 0, type: 0 };
                    }
                    acc[curr.squad][curr.unitName][curr.method] = acc[curr.squad][curr.unitName][curr.method] + 1;
                    return acc;
                },
                {} as Record<string, Record<string, Record<"type" | "grab", number>>>,
            );
        Object.entries(newAssignmentsByType).forEach(([squad, assignments]) => {
            this.logger(
                `Squad ${squad} received: ${Object.entries(assignments)
                    .flatMap(([unitType, methodToCount]) =>
                        Object.entries(methodToCount)
                            .filter(([, count]) => count > 0)
                            .map(([method, count]) => unitType + " x " + count + " (by " + method + ")"),
                    )
                    .join(", ")}`,
            );
        });
    }

    private addUnitToSquad(squad: Squad, unit: UnitData) {
        squad.addUnit(unit.id);
        this.unitIdToSquad.set(unit.id, squad);
    }

    public registerSquad(squad: Squad) {
        this.squads.push(squad);
    }

    public debugSquads(gameApi: GameApi) {
        const unitsInSquad = (unitIds: number[]) => countBy(unitIds, (unitId) => gameApi.getUnitData(unitId)?.name);

        this.squads.forEach((squad) => {
            this.logger(
                `Squad ${squad.getName()}: ${Object.entries(unitsInSquad(squad.getUnitIds()))
                    .map(([unitName, count]) => `${unitName} x ${count}`)
                    .join(", ")}`,
            );
        });
    }
}
