// Meta-controller for forming and controlling squads.

import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { Mission, MissionAction, MissionActionDisband, MissionActionRegisterSquad } from "./mission.js";
import { SquadController } from "../squad/squadController.js";
import { missionFactories as MISSION_FACTORIES } from "./missionFactories.js";
import { MatchAwareness } from "../awareness.js";

export class MissionController {
    private missions: Mission[] = [];

    private forceDisbandedMissions: string[] = [];

    constructor(private logger: (message: string) => void) {}

    public onAiUpdate(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        squadController: SquadController,
    ) {
        const { threatCache } = matchAwareness;
        // Remove inactive missions.
        this.missions = this.missions.filter((missions) => missions.isActive());

        // Poll missions for requested actions.
        let missionActions = this.missions.map((mission) => ({
            mission,
            action: mission.onAiUpdate(gameApi, playerData, threatCache),
        }));

        // Handle disbands and merges.
        const isDisband = (a: MissionAction) => a.type == "disband";
        let disbandedMissions: Map<string, any> = new Map();
        this.forceDisbandedMissions.forEach((name) => disbandedMissions.set(name, null));
        this.forceDisbandedMissions = [];
        missionActions
            .filter((a) => isDisband(a.action))
            .forEach((a) => {
                disbandedMissions.set(a.mission.getUniqueName(), (a.action as MissionActionDisband).reason);
            });

        // Remove disbanded and merged squads.
        this.missions
            .filter((missions) => disbandedMissions.has(missions.getUniqueName()))
            .forEach((disbandedMission) => {
                this.logger(`mission disbanded: ${disbandedMission.getUniqueName()}`);
                disbandedMission.getSquad()?.setMission(null);
                disbandedMission.endMission(disbandedMissions.get(disbandedMission.getUniqueName()));
            });
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
        const missionNames: Set<String> = new Set();
        this.missions.forEach((mission) => missionNames.add(mission.getUniqueName()));
        MISSION_FACTORIES.forEach((missionFactory) => {
            const maybeMissions = missionFactory.maybeCreateMission(gameApi, playerData, matchAwareness, this.missions);
            maybeMissions.forEach((newMission) => {
                if (!missionNames.has(newMission.getUniqueName())) {
                    this.logger(`Starting new mission ${newMission.getUniqueName()}.`);
                    this.missions.push(newMission);
                    missionNames.add(newMission.getUniqueName());
                } else {
                    //this.logger(`Rejecting new mission ${maybeMission.getUniqueName()} as another mission exists.`);
                }
            });
        });
    }

    public addMission(mission: Mission) : Mission | null {
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
}
