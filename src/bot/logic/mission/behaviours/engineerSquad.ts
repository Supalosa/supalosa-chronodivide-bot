import { ActionsApi, GameApi, OrderType, PlayerData, SideType } from "@chronodivide/game-api";
import { MatchAwareness } from "../../awareness.js";
import { ActionBatcher } from "../actionBatcher.js";
import { MissionBehaviour } from "../missions/missionBehaviour.js";
import { Mission, MissionAction, disbandMission, noop, requestUnits } from "../mission.js";

const CAPTURE_COOLDOWN_TICKS = 30;

// Capture squad
export class EngineerSquad implements MissionBehaviour {
    private hasAttemptedCaptureWith: {
        unitId: number;
        gameTick: number;
    } | null = null;

    /**
     * @param captureTarget ID of the target to try and capture/send engineer into.
     */
    constructor(private captureTarget: number) {}

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        actionBatcher: ActionBatcher,
        playerData: PlayerData,
        mission: Mission<EngineerSquad>,
        matchAwareness: MatchAwareness,
    ): MissionAction {
        const engineerTypes = ["ENGINEER", "SENGINEER"];
        const engineers = mission.getUnitsOfTypes(gameApi, ...engineerTypes);
        if (engineers.length === 0) {
            // Perhaps we deployed already (or the unit was destroyed), end the mission.
            if (this.hasAttemptedCaptureWith !== null) {
                return disbandMission();
            }
            return requestUnits(engineerTypes, 100);
        } else if (
            !this.hasAttemptedCaptureWith ||
            gameApi.getCurrentTick() > this.hasAttemptedCaptureWith.gameTick + CAPTURE_COOLDOWN_TICKS
        ) {
            actionsApi.orderUnits(
                engineers.map((engineer) => engineer.id),
                OrderType.Capture,
                this.captureTarget,
            );
            // Add a cooldown to deploy attempts.
            this.hasAttemptedCaptureWith = {
                unitId: engineers[0].id,
                gameTick: gameApi.getCurrentTick(),
            };
        }
        return noop();
    }

    public getGlobalDebugText(): string | undefined {
        return undefined;
    }
}
