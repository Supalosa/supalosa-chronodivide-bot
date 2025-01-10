import { GameApi, PlayerData, TechnoRules } from "@chronodivide/game-api";
import { AiBuildingRules, getDefaultPlacementLocation } from "./buildingRules.js";
import { BasicBuilding } from "./basicBuilding.js";
import { GlobalThreat } from "../threat/threat.js";

export class NavalYard extends BasicBuilding {
    constructor(
        basePriority: number, 
        maxNeeded: number, 
        onlyBuildWhenFloatingCreditsAmount?: number,
        private logger: (message: string, sayInGame?: boolean) => void = () => {},
    ) {
        super(basePriority, maxNeeded, onlyBuildWhenFloatingCreditsAmount);
    }

    override getPlacementLocation(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
    ): { rx: number; ry: number } | undefined {
        // 获取建筑的尺寸信息
        const placementData = game.getBuildingPlacementData(technoRules.name);
        this.logger(`[NavalYard] 尝试放置船厂 ${technoRules.name}，尺寸: ${placementData.foundation.width}x${placementData.foundation.height}`, true);

        // 使用默认的放置逻辑，但指定必须在水域上
        const location = getDefaultPlacementLocation(game, playerData, playerData.startLocation, technoRules, true, 1);
        
        if (location) {
            this.logger(`[NavalYard] 找到合适的放置位置: (${location.rx}, ${location.ry})`, true);
        } else {
            this.logger(`[NavalYard] 未找到合适的放置位置`, true);
        }
        
        return location;
    }

    override getPriority(
        game: GameApi,
        playerData: PlayerData,
        technoRules: TechnoRules,
        threatCache: GlobalThreat | null,
    ): number {
        const priority = super.getPriority(game, playerData, technoRules, threatCache);
        if(priority !== -100){
            this.logger(`[NavalYard] 当前建造优先级: ${priority}`, true);
        }
        return priority;
    }
} 