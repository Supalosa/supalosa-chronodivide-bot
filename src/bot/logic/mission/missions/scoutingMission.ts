import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../../threat/threat.js";
import { Mission, MissionAction, disbandMission, noop } from "../mission.js";
import { ExpansionSquad } from "../../squad/behaviours/expansionSquad.js";
import { Squad } from "../../squad/squad.js";
import { MissionFactory } from "../missionFactories.js";
import { ScoutingSquad } from "../../squad/behaviours/scoutingSquad.js";

/**
 * A mission that tries to scout around the map with a cheap, fast unit (usually attack dogs)
 */
export class ScoutingMission extends Mission {
    private hadSquad = false;

    constructor(uniqueName: string, priority: number) {
        super(uniqueName, priority);
    }

    onAiUpdate(gameApi: GameApi, playerData: PlayerData, threatData: GlobalThreat): MissionAction {
        if (this.getSquad() === null) {
            if (!this.hadSquad) {
                this.hadSquad = true;
                return this.setSquad(new Squad(this.getUniqueName(), new ScoutingSquad(), this));
            } else {
                return disbandMission();
            }
        } else {
            return noop();
        }
    }
}

export class ExpansionMissionFactory implements MissionFactory {
    maybeCreateMission(
        gameApi: GameApi,
        playerData: PlayerData,
        threatData: GlobalThreat | undefined,
        existingMissions: Mission[]
    ): Mission | null {
        // No auto-expansion missions.
        return null;
    }
}
