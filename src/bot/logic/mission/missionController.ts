// Meta-controller for forming and controlling squads.

import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { Mission, MissionAction, MissionActionDisband, missionFactories } from "./mission.js";

export class MissionController {
    
    constructor(
        private missions: Mission[] = []
    ) {}

    public onAiUpdate(gameApi: GameApi, playerData: PlayerData, threatData: GlobalThreat | undefined) {
        // Remove disbanded missions.
        this.missions = this.missions.filter(missions => missions.isActive());

        let missionActions = this.missions.map(mission => {return {mission, action: mission.onAiUpdate(gameApi, playerData, threatData)}});
        // Handle disbands and merges.
        const isDisband = (a: MissionAction): a is MissionActionDisband => a.type == 'disband';
        let disbandedMissions: Set<string> = new Set();
        missionActions
            .filter(a => isDisband(a.action))
            .forEach(a => {
                a.mission.getSquads().forEach(squad => {
                    squad.setMission(undefined);
                });
                disbandedMissions.add(a.mission.getUniqueName());
            });
        // remove disbanded and merged squads.
        this.missions.filter(missions => !disbandedMissions.has(missions.getUniqueName()));

        // Create missions.
        let newMissions: Mission[];
        let missionNames: Set<String> = new Set();
        this.missions.forEach(mission => missionNames.add(mission.getUniqueName()));
        missionFactories.forEach(missionFactory => {
            let maybeMission = missionFactory.maybeCreateMission(gameApi, playerData, threatData, this.missions);
            if (maybeMission) {
                if (missionNames.has(maybeMission.getUniqueName())) {
                    //console.log(`Rejecting new mission ${maybeMission.getUniqueName()} as another mission exists.`);
                } else {
                    console.log(`Starting new mission ${maybeMission.getUniqueName()}.`);
                    this.missions.push(maybeMission);
                    missionNames.add(maybeMission.getUniqueName());
                }
            }
        });
    }
}