import { GameApi, PlayerData, Point2D } from "@chronodivide/game-api";
import { MatchAwareness } from "../../awareness.js";
import { MissionController } from "../missionController.js";
import { Mission, MissionAction, disbandMission, noop } from "../mission.js";
import { MissionFactory } from "../missionFactories.js";
import { Squad } from "../../squad/squad.js";
import { CombatSquad } from "../../squad/behaviours/combatSquad.js";

export enum DefenceFailReason {
    NoTargets,
}

/**
 * A mission that tries to defend a certain area.
 */
export class DefenceMission extends Mission<DefenceFailReason> {
    constructor(
        uniqueName: string,
        priority: number,
        private defenceArea: Point2D,
        private radius: number,
    ) {
        super(uniqueName, priority);
    }

    onAiUpdate(gameApi: GameApi, playerData: PlayerData, matchAwareness: MatchAwareness): MissionAction {
        if (this.getSquad() === null) {
            return this.setSquad(
                new Squad(
                    "defenceSquad-" + this.getUniqueName(),
                    new CombatSquad(matchAwareness.getMainRallyPoint(), this.defenceArea, this.radius),
                    this,
                ),
            );
        } else {
            // Dispatch missions.
            const foundTargets = matchAwareness.getHostilesNearPoint2d(this.defenceArea, this.radius);

            if (foundTargets.length === 0) {
                return disbandMission(DefenceFailReason.NoTargets);
            }
        }
        return noop();
    }
}

const DEFENCE_CHECK_TICKS = 30;
const DEFENCE_STARTING_RADIUS = 20;
// Every game tick, we increase the defendable area by this amount.
const DEFENCE_RADIUS_INCREASE_PER_GAME_TICK = 0.005;

export class DefenceMissionFactory implements MissionFactory {
    private lastDefenceCheckAt = 0;

    constructor() {}

    getName(): string {
        return "DefenceMissionFactory";
    }

    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
    ): void {
        if (gameApi.getCurrentTick() < this.lastDefenceCheckAt + DEFENCE_CHECK_TICKS) {
            return;
        }
        this.lastDefenceCheckAt = gameApi.getCurrentTick();

        const defendableRadius =
            DEFENCE_STARTING_RADIUS + DEFENCE_RADIUS_INCREASE_PER_GAME_TICK * gameApi.getCurrentTick();
        const enemiesNearSpawn = matchAwareness.getHostilesNearPoint2d(playerData.startLocation, defendableRadius);

        if (enemiesNearSpawn.length > 0) {
            missionController.addMission(
                new DefenceMission("globalDefence", 1000, playerData.startLocation, defendableRadius * 1.2),
            );
        }
    }

    onMissionFailed(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        failedMission: Mission,
        failureReason: undefined,
        missionController: MissionController,
    ): void {}
}
