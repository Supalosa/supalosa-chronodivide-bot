import { Box2, GameApi, GameMath, PlayerData, Vector2 } from "@chronodivide/game-api";
import { Sector } from "../map/sector";

export function calculateSectorThreat(startX: number, startY: number, sectorSize: number, gameApi: GameApi, playerData: PlayerData) {
    const unitsInArea = gameApi.getUnitsInArea(new Box2(new Vector2(startX, startY), new Vector2(startX + sectorSize, startY + sectorSize)));

    let threat = 0;
    for (const unitId of unitsInArea) {
        const unit = gameApi.getGameObjectData(unitId);
        if (!unit) {
            continue;
        }
        // note: allied players are threats currently
        if (unit.owner !== playerData.name) {
            threat += unit.maxHitPoints ?? 1;
        }
    }
    return threat;
}

export function calculateDiffuseSectorThreat(currentThreat: number, currentDiffuseThreat: number, neighbours: Sector[]) {
    const totalNeighbourThreat = currentThreat + neighbours.reduce((acc, cV) => acc + (cV.threatLevel ?? 0), 0);
    const totalNeighbourDiffuseThreat = currentDiffuseThreat + neighbours.reduce((acc, cV) => acc + (cV.diffuseThreatLevel ?? 0), 0);
    // somewhere between the current (actual) threat and the neighbouring threat, but never less than the actual threat in neghbouring cells
    return Math.max(totalNeighbourThreat, totalNeighbourThreat + totalNeighbourDiffuseThreat * (1/8) * 0.99);
}