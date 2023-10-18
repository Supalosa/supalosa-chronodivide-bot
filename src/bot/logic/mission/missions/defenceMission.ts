import { GameApi, PlayerData, Point2D } from "@chronodivide/game-api";
import { MatchAwareness } from "../../awareness.js";
import { MissionController } from "../missionController.js";
import { Mission, MissionAction, disbandMission, noop } from "../mission.js";
import { MissionFactory } from "../missionFactories.js";
import { Squad } from "../../squad/squad.js";
import { CombatSquad } from "../../squad/behaviours/combatSquad.js";
import { RetreatMission } from "./retreatMission.js";
import { DebugLogger } from "../../common/utils.js";

export enum DefenceFailReason {
    NoTargets,
}

/**
 * A mission that tries to defend a certain area.
 */
export class DefenceMission extends Mission<DefenceFailReason> {
    private combatSquad?: CombatSquad;

    constructor(
        uniqueName: string,
        priority: number,
        private defenceArea: Point2D,
        private radius: number,
        logger: DebugLogger,
    ) {
        super(uniqueName, priority, logger);
    }

    onAiUpdate(gameApi: GameApi, playerData: PlayerData, matchAwareness: MatchAwareness): MissionAction {
        if (this.getSquad() === null && !this.combatSquad) {
            this.combatSquad = new CombatSquad(matchAwareness.getMainRallyPoint(), this.defenceArea, this.radius);
            return this.setSquad(new Squad("defenceSquad-" + this.getUniqueName(), this.combatSquad, this));
        } else {
            // Dispatch missions.
            const foundTargets = matchAwareness.getHostilesNearPoint2d(this.defenceArea, this.radius);

            if (foundTargets.length === 0) {
                this.logger(`(Defence Mission ${this.getUniqueName()}): No targets found, disbanding.`);
                return disbandMission(DefenceFailReason.NoTargets);
            } else {
                const targetUnit = gameApi.getUnitData(foundTargets[0].unitId);
                this.logger(
                    `(Defence Mission ${this.getUniqueName()}): Focused on target ${targetUnit?.name} (${
                        foundTargets.length
                    } found in area ${this.radius})`,
                );
                this.combatSquad?.setAttackArea({ x: foundTargets[0].x, y: foundTargets[0].y });
            }
        }
        return noop();
    }
}

const DEFENCE_CHECK_TICKS = 30;

// Starting radius around the player's base to trigger defense.
const DEFENCE_STARTING_RADIUS = 10;
// Every game tick, we increase the defendable area by this amount.
const DEFENCE_RADIUS_INCREASE_PER_GAME_TICK = 0.001;

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
        logger: DebugLogger,
    ): void {
        if (gameApi.getCurrentTick() < this.lastDefenceCheckAt + DEFENCE_CHECK_TICKS) {
            return;
        }
        this.lastDefenceCheckAt = gameApi.getCurrentTick();

        const defendableRadius =
            DEFENCE_STARTING_RADIUS + DEFENCE_RADIUS_INCREASE_PER_GAME_TICK * gameApi.getCurrentTick();
        const enemiesNearSpawn = matchAwareness.getHostilesNearPoint2d(playerData.startLocation, defendableRadius);

        if (enemiesNearSpawn.length > 0) {
            logger(
                `Starting defence mission, ${
                    enemiesNearSpawn.length
                } found in radius ${defendableRadius} (tick ${gameApi.getCurrentTick()})`,
            );
            missionController.addMission(
                new DefenceMission(
                    "globalDefence",
                    1000,
                    playerData.startLocation,
                    defendableRadius * 1.2,
                    logger,
                ).then((reason, squad) => {
                    missionController.addMission(
                        new RetreatMission(
                            "retreat-from-globalDefence" + gameApi.getCurrentTick(),
                            100,
                            matchAwareness.getMainRallyPoint(),
                            squad?.getUnitIds() ?? [],
                            logger,
                        ),
                    );
                }),
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
