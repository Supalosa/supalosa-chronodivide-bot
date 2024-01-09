import { GameApi, PlayerData, TechnoRules, Vector2 } from "@chronodivide/game-api";
import { getPointTowardsOtherPoint } from "../map/map.js";
import { getDefaultPlacementLocation } from "./buildingRules.js";

export const getStaticDefencePlacement = (game: GameApi, playerData: PlayerData, technoRules: TechnoRules) => {
    // Prefer front towards enemy.
    let startLocation = playerData.startLocation;
    let players = game.getPlayers();
    let enemyFacingLocationCandidates: Vector2[] = [];
    for (let i = 0; i < players.length; ++i) {
        let playerName = players[i];
        if (playerName == playerData.name) {
            continue;
        }
        let enemyPlayer = game.getPlayerData(playerName);
        enemyFacingLocationCandidates.push(
            getPointTowardsOtherPoint(game, startLocation, enemyPlayer.startLocation, 4, 16, 1.5),
        );
    }
    let selectedLocation =
        enemyFacingLocationCandidates[Math.floor(game.generateRandom() * enemyFacingLocationCandidates.length)];
    return getDefaultPlacementLocation(game, playerData, selectedLocation, technoRules, false, 0);
};
