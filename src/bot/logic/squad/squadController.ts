// Meta-controller for forming and controlling squads.

import { ActionsApi, GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { Squad, SquadLiveness } from "./squad.js";
import { SquadAction, SquadActionDisband, SquadActionMergeInto, SquadActionRequestUnits } from "./squadBehaviour.js";

type SquadWithAction<T> = {
    squad: Squad;
    action: T;
};

export class SquadController {
    private squads: Squad[] = [];
    private unitIdToSquad: Map<number, Squad> = new Map();

    constructor() {}

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        playerData: PlayerData,
        threatData: GlobalThreat | undefined,
        logger: (message: string) => void
    ) {
        // Remove dead squads.
        this.squads = this.squads.filter((squad) => squad.getLiveness() !== SquadLiveness.SquadDead);
        this.squads.sort((a, b) => a.getName().localeCompare(b.getName()));

        // Check for units in multiple squads, this shouldn't happen.
        this.unitIdToSquad = new Map();
        this.squads.forEach((squad) => {
            squad.getUnitIds().forEach((unitId) => {
                if (this.unitIdToSquad.has(unitId)) {
                    logger(`WARNING: unit ${unitId} is in multiple squads, please debug.`);
                } else {
                    this.unitIdToSquad.set(unitId, squad);
                }
            });
        });

        const squadActions: SquadWithAction<SquadAction>[] = this.squads.map((squad) => {
            return {
                squad,
                action: squad.onAiUpdate(gameApi, actionsApi, playerData, threatData),
            };
        });
        // Handle disbands and merges.
        const isDisband = (a: SquadAction): a is SquadActionDisband => a.type == "disband";
        const isMerge = (a: SquadAction): a is SquadActionMergeInto => a.type == "mergeInto";
        let disbandedSquads: Set<string> = new Set();
        squadActions
            .filter((a) => isDisband(a.action))
            .forEach((a) => {
                logger(`Squad ${a.squad.getName()} disbanding as requested.`);
                a.squad.getMission()?.removeSquad();
                a.squad.getUnitIds().forEach((unitId) => {
                    this.unitIdToSquad.delete(unitId);
                });
                a.squad.clearUnits();
                disbandedSquads.add(a.squad.getName());
            });
        squadActions
            .filter((a) => isMerge(a.action))
            .forEach((a) => {
                let mergeInto = a.action as SquadActionMergeInto;
                if (disbandedSquads.has(mergeInto.mergeInto.getName())) {
                    logger(
                        `Squad ${a.squad.getName()} tried to merge into disbanded squad ${mergeInto.mergeInto.getName()}, cancelling.`
                    );
                    return;
                }
                a.squad.getUnitIds().forEach((unitId) => mergeInto.mergeInto.addUnit(unitId));
                disbandedSquads.add(a.squad.getName());
            });
        // remove disbanded and merged squads.
        this.squads = this.squads.filter((squad) => !disbandedSquads.has(squad.getName()));

        // Request units
        const isRequest = (a: SquadAction) => a.type == "request";
        const unitTypeToHighestRequest = squadActions
            .filter((a) => isRequest(a.action))
            .reduce((prev, a) => {
                const squadWithAction = a as SquadWithAction<SquadActionRequestUnits>;
                const { unitName } = squadWithAction.action;
                if (prev.hasOwnProperty(unitName)) {
                    if (prev[unitName].action.priority > prev[unitName].action.priority) {
                        prev[unitName] = squadWithAction;
                    }
                } else {
                    prev[unitName] = squadWithAction;
                }
                return prev;
            }, {} as Record<string, SquadWithAction<SquadActionRequestUnits>>);

        // Find loose units
        const unitIds = gameApi.getVisibleUnits(playerData.name, "self");
        const freeUnits = unitIds
            .map((unitId) => gameApi.getUnitData(unitId))
            .filter((unit) => !!unit && !this.unitIdToSquad.has(unit.id || 0))
            .map((unit) => unit!);
        freeUnits.forEach((freeUnit) => {
            if (unitTypeToHighestRequest.hasOwnProperty(freeUnit.name)) {
                const { squad: requestingSquad } = unitTypeToHighestRequest[freeUnit.name];
                logger(`granting unit ${freeUnit.id}#${freeUnit.name} to squad ${requestingSquad.getName()}`);
                requestingSquad.addUnit(freeUnit.id);
                this.unitIdToSquad.set(freeUnit.id, requestingSquad);
                delete unitTypeToHighestRequest[freeUnit.name];
            }
        });
    }

    public registerSquad(squad: Squad) {
        this.squads.push(squad);
    }
}
