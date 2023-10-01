import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../../threat/threat.js";
import { Mission, MissionAction, disbandMission, noop } from "../mission.js";
import { SquadExpansion } from "../../squad/behaviours/expansionSquad.js";
import { Squad } from "../../squad/squad.js";
import { MissionFactory } from "../missionFactories.js";

/**
 * A mission that tries to create an MCV (if it doesn't exist) and deploy it somewhere it can be deployed.
 */
export class ExpansionMission extends Mission {
    private hadSquad = false;

    constructor(uniqueName: string, priority: number) {
        super(uniqueName, priority);
    }

    onAiUpdate(gameApi: GameApi, playerData: PlayerData, threatData: GlobalThreat): MissionAction {
        if (this.getSquad() === null) {
            if (!this.hadSquad) {
                this.hadSquad = true;
                return this.setSquad(new Squad(this.getUniqueName(), new SquadExpansion(), this));
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
