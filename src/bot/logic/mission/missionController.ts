// Meta-controller for forming and controlling squads.

import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { Mission, MissionAction, MissionActionDisband, MissionActionRegisterSquad } from "./mission.js";
import { SquadController } from "../squad/squadController.js";
import { missionFactories as MISSION_FACTORIES } from "./missionFactories.js";
import { MatchAwareness } from "../awareness.js";
import { disband } from "../squad/squadBehaviour.js";

export class MissionController {
    private missions: Mission<any>[] = [];

    private forceDisbandedMissions: string[] = [];

    constructor(private logger: (message: string) => void) {}

    public onAiUpdate(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        squadController: SquadController
    ) {
        const { threatCache } = matchAwareness;
        // Remove inactive missions.
        this.missions = this.missions.filter((missions) => missions.isActive());

        // Poll missions for requested actions.
        const missionActions = this.missions.map((mission) => ({
            mission,
            action: mission.onAiUpdate(gameApi, playerData, threatCache),
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
                this.logger(`mission disbanded: ${disbandedMission.getUniqueName()}`);
                const reason = disbandedMissions.get(disbandedMission.getUniqueName());
                disbandedMissionsArray.push({ mission: disbandedMission, reason });
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
            const maybeMissions = missionFactory.maybeCreateMissions(
                gameApi,
                playerData,
                matchAwareness,
                this.missions
            );
            maybeMissions.forEach((newMission) => {
                if (!missionNames.has(newMission.getUniqueName())) {
                    this.logger(`Starting new mission ${newMission.getUniqueName()}.`);
                    this.missions.push(newMission);
                    missionNames.add(newMission.getUniqueName());
                } else {
                    this.logger(
                        `Rejecting new mission ${newMission.getUniqueName()} as another mission exists with that name.`
                    );
                }
            });
            disbandedMissionsArray.forEach(({ reason, mission }) => {
                const newMissions = missionFactory.onMissionFailed(
                    gameApi,
                    playerData,
                    matchAwareness,
                    mission,
                    reason
                );
                newMissions.forEach((newMission) => {
                    if (!missionNames.has(newMission.getUniqueName())) {
                        this.logger(
                            `Starting new mission ${newMission.getUniqueName()} because ${mission.getUniqueName()} failed for reason ${reason}`
                        );
                        this.missions.push(newMission);
                        missionNames.add(newMission.getUniqueName());
                    }
                });
            });
        });
    }

    public addMission<T>(mission: Mission<T>): Mission<T> | null {
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
        this.logger(`Missions (${this.missions.length}): ${this.missions.join(", ")}`);
    }
}
