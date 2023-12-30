// Used to group related actions together to minimise actionApi calls. For example, if multiple units

import { ActionsApi, OrderType, Vector2 } from "@chronodivide/game-api";
import { groupBy } from "../../common/utils.js";

// are ordered to move to the same location, all of them will be ordered to move in a single action.
export type BatchableAction = {
    unitId: number;
    orderType: OrderType;
    point?: Vector2;
    targetId?: number;
};

export class ActionBatcher {
    private actions: BatchableAction[];

    constructor() {
        this.actions = [];
    }

    push(action: BatchableAction) {
        this.actions.push(action);
    }

    resolve(actionsApi: ActionsApi) {
        const groupedCommands = groupBy(this.actions, (action) => action.orderType.valueOf().toString());
        const vectorToStr = (v: Vector2) => v.x + "," + v.y;
        const strToVector = (str: string) => {
            const [x, y] = str.split(",");
            return new Vector2(parseInt(x), parseInt(y));
        };

        // Group by command type.
        Object.entries(groupedCommands).forEach(([commandValue, commands]) => {
            // i hate this
            const commandType: OrderType = parseInt(commandValue) as OrderType;
            // Group by command target ID.
            const byTarget = groupBy(
                commands.filter((command) => !!command.targetId),
                (command) => command.targetId?.toString()!,
            );
            Object.entries(byTarget).forEach(([targetId, unitCommands]) => {
                actionsApi.orderUnits(
                    unitCommands.map((command) => command.unitId),
                    commandType,
                    parseInt(targetId),
                );
            });
            // Group by position (the vector is encoded as a string of the form "x,y")
            const byPosition = groupBy(
                commands.filter((command) => !!command.point),
                (command) => vectorToStr(command.point!),
            );
            Object.entries(byPosition).forEach(([point, unitCommands]) => {
                const vector = strToVector(point);
                actionsApi.orderUnits(
                    unitCommands.map((command) => command.unitId),
                    commandType,
                    vector.x,
                    vector.y,
                );
            });
        });
    }
}
