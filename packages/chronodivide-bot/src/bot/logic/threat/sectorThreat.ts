import { Box2, GameApi, GameMath, MapApi, PlayerData, Vector2 } from "@chronodivide/game-api";
import { Sector, SectorAndDist } from "../map/sector";

export function calculateSectorThreat(startX: number, startY: number, sectorSize: number, gameApi: GameApi, playerData: PlayerData) {
    const unitsInArea = gameApi.getUnitsInArea(new Box2(new Vector2(startX, startY), new Vector2(startX + sectorSize, startY + sectorSize)));

    let threat = 0;
    for (const unitId of unitsInArea) {
        const unit = gameApi.getGameObjectData(unitId);
        if (!unit || !unit.owner) {
            continue;
        }
        if (unit.owner === playerData.name) {
            threat -= unit.maxHitPoints ?? 1;
            continue;
        }
        if (gameApi.areAlliedPlayers(playerData.name, unit.owner)) {
            continue;
        }
        const owner = gameApi.getPlayerData(unit.owner);
        if (!owner.isCombatant) {
            continue;
        }
        threat += unit.maxHitPoints ?? 1;
    }
    return threat;
}

export function calculateDiffuseSectorThreat(currentThreat: number, currentDiffuseThreat: number, neighbours: SectorAndDist[]) {
    // the objective is for a cell's threat to slowly spread (diffuse) into its neighbouring cells.
    // However, because this is reciprocal (the threat comes back to the current cell on the next cycle), care must be taken to avoid 'runaway' threat where the
    // threat rises exponentially and hits FP precision issues.
    const totalNeighbourThreat = currentThreat + neighbours.reduce((acc, cV) => acc + (cV.sector.threatLevel ?? 0), 0);
    const maxOfNeighboursThreat = neighbours.reduce((pV, cV) => Math.max(pV, (cV.sector.diffuseThreatLevel ?? 0) * cV.dist), 0);
    return Math.max(totalNeighbourThreat, maxOfNeighboursThreat * 0.95);
}

export function calculateMoney(startX: number, startY: number, size: number, mapApi: MapApi) {
    return mapApi
        .getTilesInRect({ x: startX, y: startY, width: size, height: size})
        .map((t) => mapApi.getTileResourceData(t)).map((t) => t ? t.gems + t.ore : 0)
        .reduce((pV, cV) => pV + cV, 0);
}