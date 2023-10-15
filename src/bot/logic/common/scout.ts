import { GameApi, PlayerData } from "@chronodivide/game-api";

export const getUnseenStartingLocations = (gameApi: GameApi, playerData: PlayerData) => {
    const unseenStartingLocations = gameApi.mapApi.getStartingLocations().filter((startingLocation) => {
        if (startingLocation == playerData.startLocation) {
            return false;
        }
        let tile = gameApi.mapApi.getTile(startingLocation.x, startingLocation.y);
        return tile ? !gameApi.mapApi.isVisibleTile(tile, playerData.name) : false;
    });
    return unseenStartingLocations;
};
