import { GameApi, PlayerData } from "@chronodivide/game-api";
import { GlobalThreat } from "../threat/threat.js";
import { BasicMission } from "./basicMission.js";
import { Mission, MissionAction, MissionActionNoop, MissionFactory } from "./mission";

export class ExpansionMission extends BasicMission {
    constructor(uniqueName: string, priority: number) {
        super(uniqueName, priority);
    }

    onAiUpdate(gameApi: GameApi, playerData: PlayerData, threatData: GlobalThreat): MissionAction {
        return {} as MissionActionNoop;
    }
}

export class ExpansionMissionFactory implements MissionFactory {
    maybeCreateMission(
        gameApi: GameApi,
        playerData: PlayerData,
        threatData: GlobalThreat | undefined,
        existingMissions: Mission[],
    ): Mission | undefined {
        return new ExpansionMission("expansion", 10);
    }
}
