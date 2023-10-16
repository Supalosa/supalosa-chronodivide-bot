import { AttackState, GameApi, ObjectType, PlayerData, Point2D, UnitData } from "@chronodivide/game-api";
import { OneTimeMission } from "./oneTimeMission.js";
import { CombatSquad } from "../../squad/behaviours/combatSquad.js";
import { Mission, MissionAction, disbandMission, noop } from "../mission.js";
import { GlobalThreat } from "../../threat/threat.js";
import { Squad } from "../../squad/squad.js";
import { getDistanceBetweenPoints, getDistanceBetweenUnits } from "../../map/map.js";
import { MissionFactory } from "../missionFactories.js";
import { MatchAwareness } from "../../awareness.js";
import { MissionController } from "../missionController.js";
import { match } from "assert";
import { RetreatMission } from "./retreatMission.js";
import _ from "lodash";

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
        private attackArea: Point2D,
        private radius: number,
    ) {
        super(uniqueName, priority);
    }

    onAiUpdate(gameApi: GameApi, playerData: PlayerData, matchAwareness: MatchAwareness): MissionAction {
        if (this.getSquad() === null) {
            return this.setSquad(
                new Squad(this.getUniqueName(), new CombatSquad(this.rallyArea, this.attackArea, this.radius), this),
            );
        } else {
            // Dispatch missions.
            if (!matchAwareness.shouldAttack()) {
                return disbandMission(AttackFailReason.DefenceTooStrong);
            }

            const foundTargets = matchAwareness.getHostilesNearPoint2d(this.attackArea, this.radius);

            if (foundTargets.length > 0) {
                this.lastTargetSeenAt = gameApi.getCurrentTick();
            } else if (gameApi.getCurrentTick() > this.lastTargetSeenAt + NO_TARGET_IDLE_TIMEOUT_TICKS) {
                return disbandMission(AttackFailReason.NoTargets);
            }
        }
        return noop();
    }
}

const ATTACK_COOLDOWN_TICKS = 120;

// Calculates the weight for initiating an attack on the position of a unit or building.
// This is separate from unit micro; the squad will be ordered to attack in the vicinity of the point.
const getTargetWeight: (unitData: UnitData, tryFocusHarvester: boolean) => number = (unitData, tryFocusHarvester) => {
    if (tryFocusHarvester && unitData.rules.harvester) {
        return 100000;
    } else if (unitData.type === ObjectType.Building) {
        return unitData.maxHitPoints * 10;
    } else {
        return unitData.maxHitPoints;
    }
};

export class AttackMissionFactory implements MissionFactory {
    constructor(private lastAttackAt: number = -ATTACK_COOLDOWN_TICKS) {}

    getName(): string {
        return "AttackMissionFactory";
    }

    generateTarget(gameApi: GameApi, playerData: PlayerData, matchAwareness: MatchAwareness): Point2D | null {
        // Randomly decide between harvester and base.
        try {
            const tryFocusHarvester = gameApi.generateRandomInt(0, 1) === 0;
            const enemyUnits = gameApi
                .getVisibleUnits(playerData.name, "hostile")
                .map((unitId) => gameApi.getUnitData(unitId))
                .filter((u) => !!u && gameApi.getPlayerData(u.owner).isCombatant) as UnitData[];

            const maxUnit = _.maxBy(enemyUnits, (u) => getTargetWeight(u, tryFocusHarvester));
            if (maxUnit) {
                return { x: maxUnit.tile.rx, y: maxUnit.tile.ry };
            }
        } catch (err) {
            // There's a crash here when accessing a building that got destroyed. Will catch and ignore or now.
            return null;
        }
        return null;
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

        const attackArea = this.generateTarget(gameApi, playerData, matchAwareness);

        if (!attackArea) {
            // Nothing to attack.
            return;
        }

        // TODO: not using a fixed value here. But performance slows to a crawl when this is unique.
        const squadName = "globalAttack";

        const tryAttack = missionController.addMission(
            new AttackMission(squadName, 100, matchAwareness.getMainRallyPoint(), attackArea, attackRadius).then(
                (reason, squad) => {
                    missionController.addMission(
                        new RetreatMission(
                            "retreat-from-" + squadName + gameApi.getCurrentTick(),
                            100,
                            matchAwareness.getMainRallyPoint(),
                            squad?.getUnitIds() ?? [],
                        ),
                    );
                },
            ),
        );
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
