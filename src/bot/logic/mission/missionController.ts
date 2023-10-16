// Meta-controller for forming and controlling squads.

import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { Mission, MissionAction, MissionActionDisband, MissionActionRegisterSquad } from "./mission.js";
import { SquadController } from "../squad/squadController.js";
import { MatchAwareness } from "../awareness.js";
import { MissionFactory, createMissionFactories } from "./missionFactories.js";

export class MissionController {
    private missionFactories: MissionFactory[];
    private missions: Mission<any>[] = [];

    private forceDisbandedMissions: string[] = [];

    constructor(private logger: (message: string) => void) {
        this.missionFactories = createMissionFactories();
    }

    public onAiUpdate(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        squadController: SquadController,
    ) {
        // Remove inactive missions.
        this.missions = this.missions.filter((missions) => missions.isActive());

        // Poll missions for requested actions.
        const missionActions = this.missions.map((mission) => ({
            mission,
            action: mission.onAiUpdate(gameApi, playerData, matchAwareness),
        }));

        // Handle disbands and merges.
        const isDisband = (a: MissionAction) => a.type == "disband";
        const disbandedMissions: Map<string, any> = new Map();
        const disbandedMissionsArray: { mission: Mission; reason: any }[] = [];
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
                const reason = disbandedMissions.get(disbandedMission.getUniqueName());
                this.logger(
                    `mission disbanded: ${disbandedMission.getUniqueName()}, reason: ${reason}, hasSquad: ${!!disbandedMission.getSquad}`,
                );
                disbandedMissionsArray.push({ mission: disbandedMission, reason });
                disbandedMission.endMission(disbandedMissions.get(disbandedMission.getUniqueName()));
                disbandedMission.getSquad()?.setMission(null);
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
        this.missionFactories.forEach((missionFactory) => {
            missionFactory.maybeCreateMissions(gameApi, playerData, matchAwareness, this);
            disbandedMissionsArray.forEach(({ reason, mission }) => {
                missionFactory.onMissionFailed(gameApi, playerData, matchAwareness, mission, reason, this);
            });
        });
    }

    /**
     * Attempts to add a mission to the active set.
     * @param mission
     * @returns The mission if it was accepted, or null if it was not.
     */
    public addMission<T>(mission: Mission<T | any>): Mission<T> | null {
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

    public logDebugOutput() {
        this.logger(`Missions (${this.missions.length}): ${this.missions.map((m) => m.getUniqueName()).join(", ")}`);
    }
}
