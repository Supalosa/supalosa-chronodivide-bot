// Meta-controller for forming and controlling squads.

import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { Mission, MissionAction, MissionActionRegisterSquad } from "./mission.js";
import { SquadController } from "../squad/squadController.js";
import { missionFactories as MISSION_FACTORIES } from "./missionFactories.js";

export class MissionController {
    private missions: Mission[] = [];

    constructor(private logger: (message: string) => void) {}

    public onAiUpdate(
        gameApi: GameApi,
        playerData: PlayerData,
        threatData: GlobalThreat | undefined,
        squadController: SquadController
    ) {
        // Remove inactive missions.
        this.missions = this.missions.filter((missions) => missions.isActive());

        // Poll missions for requested actions.
        let missionActions = this.missions.map((mission) => ({
            mission,
            action: mission.onAiUpdate(gameApi, playerData, threatData),
        }));

        // Handle disbands and merges.
        const isDisband = (a: MissionAction) => a.type == "disband";
        let disbandedMissions: Set<string> = new Set();
        missionActions
            .filter((a) => isDisband(a.action))
            .forEach((a) => {
                this.logger(`mission disbanded: ${a.mission.getUniqueName()}`);
                a.mission.getSquad()?.setMission(null);
                disbandedMissions.add(a.mission.getUniqueName());
            });

        // Remove disbanded and merged squads.
        this.missions = this.missions.filter((missions) => !disbandedMissions.has(missions.getUniqueName()));

        // Register new squads
        const isNewSquad = (a: MissionAction) => a.type == "registerSquad";
        missionActions
            .filter((a) => isNewSquad(a.action))
            .forEach((a) => {
                const action = a.action as MissionActionRegisterSquad;
                squadController.registerSquad(action.squad);
                this.logger(`registered a squad: ${action.squad.getName()}`);
            });

        // Create dynamic missions.
        let missionNames: Set<String> = new Set();
        this.missions.forEach((mission) => missionNames.add(mission.getUniqueName()));
        MISSION_FACTORIES.forEach((missionFactory) => {
            let maybeMission = missionFactory.maybeCreateMission(gameApi, playerData, threatData, this.missions);
            if (maybeMission) {
                if (!missionNames.has(maybeMission.getUniqueName())) {
                    this.logger(`Starting new mission ${maybeMission.getUniqueName()}.`);
                    this.missions.push(maybeMission);
                    missionNames.add(maybeMission.getUniqueName());
                } else {
                    //this.logger(`Rejecting new mission ${maybeMission.getUniqueName()} as another mission exists.`);
                }
            }
        });
    }

    public addMission(mission: Mission) {
        if (this.missions.some((m) => m.getUniqueName() === mission.getUniqueName())) {
            // reject non-unique mission names
            return;
        }
        this.logger(`Added mission: ${mission.getUniqueName()}`);
        this.missions.push(mission);
    }
}
