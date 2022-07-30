// Meta-controller for forming and controlling squads.

import { GameApi, PlayerData } from "@chronodivide/game-api";
import { Squad, SquadLiveness } from "./squad";
import { SquadAction, SquadActionDisband, SquadActionMergeInto } from "./squadBehaviour";

export class SquadController {
    
    constructor(
        private squads: Squad[],
        private unitIdToSquad: Map<number, Squad>,
    ) {}

    public onAiUpdate(gameApi: GameApi, playerData: PlayerData) {
        // Remove dead squads.
        this.squads = this.squads.filter(squad => squad.getLiveness() == SquadLiveness.SquadDead);
        this.squads.sort((a, b) => a.getName().localeCompare(b.getName()));

        // Check for units in multiple squads, this shouldn't happen.
        this.unitIdToSquad = new Map();
        this.squads.forEach(squad => {
            squad.getUnitIds().forEach(unitId => {
                if (this.unitIdToSquad.has(unitId)) {
                    console.log(`WARNING: unit ${unitId} is in multiple squads, please debug.`)
                } else {
                    this.unitIdToSquad.set(unitId, squad);
                }
            }); 
        });

        let squadActions = this.squads.map(squad => {return {squad, action: squad.onAiUpdate(gameApi, playerData)}});
        // Handle disbands and merges.
        const isDisband = (a: SquadAction): a is SquadActionDisband => a.type == 'disband';
        const isMerge = (a: SquadAction): a is SquadActionMergeInto => a.type == 'mergeInto';
        let disbandedSquads: Set<string> = new Set();
        squadActions
            .filter(a => isDisband(a.action))
            .forEach(a => {
                a.squad.getUnitIds().forEach(unitId => {
                    this.unitIdToSquad.delete(unitId);
                });
                a.squad.clearUnits();
                disbandedSquads.add(a.squad.getName());
            });
        squadActions
            .filter(a => isMerge(a.action))
            .forEach(a => {
                let mergeInto = a.action as SquadActionMergeInto;
                if (disbandedSquads.has(mergeInto.mergeInto.getName())) {
                    console.log("Merging into a disbanded squad, cancelling.");
                    return;
                }
                a.squad.getUnitIds().forEach(unitId => mergeInto.mergeInto.addUnit(unitId));
                disbandedSquads.add(a.squad.getName());
            });
        // remove disbanded and merged squads.
        this.squads.filter(squad => !disbandedSquads.has(squad.getName()));
    }
}