import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../../threat/threat.js";
import { Mission, MissionAction, disbandMission, noop } from "../mission.js";
import { ExpansionSquad } from "../../squad/behaviours/expansionSquad.js";
import { Squad } from "../../squad/squad.js";
import { MissionFactory } from "../missionFactories.js";
import { SquadBehaviour } from "../../squad/squadBehaviour.js";

/**
 * A mission that gets dispatched once, and once the squad decides to disband, the mission is disbanded.
 */
export abstract class OneTimeMission<T = undefined> extends Mission<T> {
    private hadSquad = false;

    constructor(uniqueName: string, priority: number, private behaviourFactory: () => SquadBehaviour) {
        super(uniqueName, priority);
    }

    onAiUpdate(gameApi: GameApi, playerData: PlayerData, threatData: GlobalThreat): MissionAction {
        if (this.getSquad() === null) {
            if (!this.hadSquad) {
                this.hadSquad = true;
                return this.setSquad(new Squad(this.getUniqueName(), this.behaviourFactory(), this));
            } else {
                return disbandMission();
            }
        } else {
            return noop();
        }
    }
}
