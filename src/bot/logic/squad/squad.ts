import { ActionsApi, GameApi, PlayerData, TechnoRules, Tile, UnitData, Vector2 } from "@chronodivide/game-api";
import { Mission } from "../mission/mission.js";
import { SquadAction, SquadBehaviour, disband } from "./squadBehaviour.js";
import { MatchAwareness } from "../awareness.js";
import { getDistanceBetweenTileAndPoint } from "../map/map.js";
import { DebugLogger } from "../common/utils.js";
import { ActionBatcher } from "../mission/actionBatcher.js";

export enum SquadLiveness {
    SquadDead,
    SquadActive,
}

export type SquadConstructionRequest = {
    squad: Squad;
    unitType: TechnoRules;
    priority: number;
};

export class Squad {
    private liveness: SquadLiveness = SquadLiveness.SquadActive;
    private lastLivenessUpdateTick: number = 0;

    constructor(
        private name: string,
        private behaviour: SquadBehaviour,
        private mission: Mission<any> | null,
        private killable = false,
    ) {}

    public getName(): string {
        return this.name;
    }

    public onAiUpdate(
        gameApi: GameApi,
        actionsApi: ActionsApi,
        actionBatcher: ActionBatcher,
        playerData: PlayerData,
        matchAwareness: MatchAwareness,
        logger: DebugLogger,
    ): SquadAction {
        this.updateLiveness(gameApi);

        if (this.mission && this.mission.isActive() == false) {
            // Orphaned squad, might get picked up later.
            this.mission.removeSquad();
            this.mission = null;
            return disband();
        } else if (!this.mission) {
            return disband();
        }
        return this.behaviour.onAiUpdate(gameApi, actionsApi, actionBatcher, playerData, this, matchAwareness, logger);
    }
    public getMission(): Mission | null {
        return this.mission;
    }

    public setMission(mission: Mission | null) {
        if (this.mission != undefined && this.mission != mission) {
            this.mission.removeSquad();
        }
        this.mission = mission;
    }

    private updateLiveness(gameApi: GameApi) {
        this.unitIds = this.unitIds.filter((unitId) => gameApi.getUnitData(unitId));
        this.lastLivenessUpdateTick = gameApi.getCurrentTick();
        if (this.killable && this.unitIds.length == 0) {
            if (this.liveness == SquadLiveness.SquadActive) {
                this.liveness = SquadLiveness.SquadDead;
            }
        }
    }

    public getLiveness() {
        return this.liveness;
    }

    public getGlobalDebugText(): string | undefined {
        return this.behaviour.getGlobalDebugText();
    }
}
