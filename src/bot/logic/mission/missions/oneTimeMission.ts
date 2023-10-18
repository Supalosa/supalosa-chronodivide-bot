import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../../threat/threat.js";
import { Mission, MissionAction, disbandMission, noop } from "../mission.js";
import { ExpansionSquad } from "../../squad/behaviours/expansionSquad.js";
import { Squad } from "../../squad/squad.js";
import { MissionFactory } from "../missionFactories.js";
import { SquadBehaviour } from "../../squad/squadBehaviour.js";
import { MatchAwareness } from "../../awareness.js";
import { DebugLogger } from "../../common/utils.js";

/**
 * A mission that gets dispatched once, and once the squad decides to disband, the mission is disbanded.
 */
export abstract class OneTimeMission<T = undefined> extends Mission<T> {
    private hadSquad = false;

    constructor(uniqueName: string, priority: number, private behaviourFactory: () => SquadBehaviour, logger: DebugLogger) {
        super(uniqueName, priority, logger);
    }

    onAiUpdate(gameApi: GameApi, playerData: PlayerData, matchAwareness: MatchAwareness): MissionAction {
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
