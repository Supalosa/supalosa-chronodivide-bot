import { GameApi, PlayerData, Point2D } from "@chronodivide/game-api";
import { OneTimeMission } from "./oneTimeMission.js";
import { AttackSquad } from "../../squad/behaviours/attackSquad.js";
import { Mission, MissionAction, disbandMission, noop } from "../mission.js";
import { GlobalThreat } from "../../threat/threat.js";
import { Squad } from "../../squad/squad.js";
import { getDistanceBetweenPoints, getDistanceBetweenUnits } from "../../map/map.js";
import { MissionFactory } from "../missionFactories.js";
import { MatchAwareness } from "../../awareness.js";
import { MissionController } from "../missionController.js";
import { match } from "assert";
import { RetreatMission } from "./retreatMission.js";

export type AttackTarget = Point2D | null;

export const GENERAL_ATTACK: AttackTarget = null;

export enum AttackFailReason {
    NoTargets = 0,
    DefenceTooStrong = 1,
}

const NO_TARGET_IDLE_TIMEOUT_TICKS = 60;

/**
 * A mission that tries to attack a certain area.
 */
export class AttackMission extends Mission<AttackFailReason> {
    private lastTargetSeenAt = 0;

    constructor(
        uniqueName: string,
        priority: number,
        private rallyArea: Point2D,
        private attackArea: AttackTarget,
        private radius: number,
    ) {
        super(uniqueName, priority);
    }

    private isHostileUnit(game: GameApi, unitId: number, playerData: PlayerData) {
        const unitData = game.getUnitData(unitId);
        if (!unitData) {
            return false;
        }

        return unitData.owner != playerData.name && game.getPlayerData(unitData.owner)?.isCombatant;
    }

    onAiUpdate(gameApi: GameApi, playerData: PlayerData, matchAwareness: MatchAwareness): MissionAction {
        if (this.getSquad() === null) {
            return this.setSquad(
                new Squad(this.getUniqueName(), new AttackSquad(this.rallyArea, this.attackArea, this.radius), this),
            );
        } else {
            // Dispatch missions.
            if (matchAwareness.shouldRetreat()) {
                return disbandMission(AttackFailReason.DefenceTooStrong);
            }

            const foundTarget = gameApi
                .getVisibleUnits(playerData.name, "hostile")
                .some((unit) => this.isHostileUnit(gameApi, unit, playerData));
            if (foundTarget) {
                this.lastTargetSeenAt = gameApi.getCurrentTick();
            } else if (gameApi.getCurrentTick() > this.lastTargetSeenAt + NO_TARGET_IDLE_TIMEOUT_TICKS) {
                console.log(`Mission - Can't see any targets, disbanding attack.`);
                return disbandMission(AttackFailReason.NoTargets);
            }
        }
        return noop();
    }
}

const ATTACK_COOLDOWN_TICKS = 120;

export class AttackMissionFactory implements MissionFactory {
    constructor(private lastAttackAt: number = -ATTACK_COOLDOWN_TICKS) {}

    getName(): string {
        return "AttackMissionFactory";
    }

    maybeCreateMissions(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        missionController: MissionController,
    ): void {
        if (!matchAwareness.shouldAttack()) {
            return;
        }
        if (gameApi.getCurrentTick() < this.lastAttackAt + ATTACK_COOLDOWN_TICKS) {
            return;
        }

        const attackRadius = 15;
        // TODO: not using a fixed value here. But performance slows to a crawl when this is unique.
        const squadName = "globalAttack";

        const tryAttack = missionController
            .addMission(
                new AttackMission(squadName, 100, matchAwareness.getMainRallyPoint(), GENERAL_ATTACK, attackRadius),
            )
            ?.then((reason, squad) => {
                missionController.addMission(new RetreatMission("retreat-from-" + squadName, 100, matchAwareness.getMainRallyPoint(), squad?.getUnitIds() ?? []));
            });
        if (tryAttack) {
            this.lastAttackAt = gameApi.getCurrentTick();
        }
    }

    onMissionFailed(
        gameApi: GameApi,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        failedMission: Mission,
        failureReason: any,
        missionController: MissionController,
    ): void {}
}
