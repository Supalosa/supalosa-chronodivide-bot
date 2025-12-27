import { createCanvas, Canvas, CanvasRenderingContext2D } from "canvas";
import * as fs from 'fs';

import { GameApi, LandType, QueueStatus, Tile, UnitData } from "@chronodivide/game-api";
import { SupalosaBot } from "@supalosa/chronodivide-bot/dist/bot/bot.js";
import { formatTimeDuration } from "@supalosa/chronodivide-bot/dist/bot/logic/common/utils.js";
import { queueTypeToName, QUEUES } from "@supalosa/chronodivide-bot/dist/bot/logic/building/queueController.js";
import { fromRGBNum, IncrementalGridCache } from "@supalosa/chronodivide-bot/dist/bot/logic/map/incrementalGridCache.js";

const MAP_SCALE = 8;

export type VisualisedBotOpts = {
    outFolder: string;
    tickInterval: number;
    includeBaseMap: boolean;
    includeHeatmaps: boolean;
}

/**
 * A wrapper around SupalosaBot that dumps images every N ticks with a representation of the game state and the internal
 * debug state of the bot (log messages, 'globalDebugText' etc).
 * 
 * This was developed to diagnose the state of the bot tick-by-tick (although I wouldn't recommend generating an image
 * more than once every few ticks for performance reasons).
 */
export class VisualisedBot extends SupalosaBot {
    name: string;
    private canvas: Canvas | null = null;
    private baseMapCanvas: Canvas | null = null;

    private yDebugMessagesStart: number = -1;
    private lastSeenMessage: string | null = null;

    constructor(private opts: VisualisedBotOpts, ...botArgs: ConstructorParameters<typeof SupalosaBot>) {
        super(...botArgs);
        this.name = botArgs[0];
    }

    override onGameStart(game: GameApi) {
        super.onGameStart(game);

        const { width: mapWidth, height: mapHeight } = game.mapApi.getRealMapSize();
        const width = Math.max(mapWidth * MAP_SCALE, 800);
        const height = Math.max(mapHeight * MAP_SCALE, 600) + 200;
        this.yDebugMessagesStart = mapHeight * MAP_SCALE;
        this.canvas = createCanvas(width, height);
        this.baseMapCanvas = createCanvas(width, height);

        // Pre-render base map
        const baseMapCtx = this.baseMapCanvas.getContext("2d");
        baseMapCtx.fillStyle = "black";
        baseMapCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        const tiles = game.mapApi.getTilesInRect({ x: 0, y: 0, width: mapWidth, height: mapHeight });
        for (const tile of tiles) {
            this.renderBaseTile(baseMapCtx, tile);
        }
    }

    override onGameTick(game: GameApi) {
        super.onGameTick(game);

        if (!this.canvas || !this.baseMapCanvas) {
            return;
        }

        if (game.getCurrentTick() % this.opts.tickInterval !== 0) {
            return;
        }

        const player = game.getPlayerData(this.name);

        // Copy from base map canvas to canvas
        const ctx = this.canvas.getContext("2d");
        ctx.drawImage(this.baseMapCanvas, 0, 0);

        ctx.font = "30px monospace";
        ctx.fillStyle = "white";
        ctx.fillText(`Tick ${game.getCurrentTick()} (${formatTimeDuration(game.getCurrentTick() / 15)})`, 0, 30);

        ctx.fillStyle = "yellow";
        ctx.fillText(`$${player.credits}, PWR ${player.power.drain} / ${player.power.total}`, 0, 60);

        this.renderQueueInfo(ctx, game);

        this.renderResourceOverlay(ctx, game);
        this.renderUnitInfo(ctx, game);

        // draw logger messages
        ctx.font = "10px monospace";
        let y = this.yDebugMessagesStart;
        const lastSeenMessageIndex = this.lastSeenMessage !== null ? this._debugMessages.indexOf(this.lastSeenMessage) : 0;
        for (const [idx, message] of this._debugMessages.entries()) {
            if (idx > lastSeenMessageIndex) {
                ctx.fillStyle = "white";
            } else {
                ctx.fillStyle = "grey";
            }
            ctx.fillText(message, 0, y);
            y += 10;
        }

        // draw debug text
        ctx.save();
        ctx.font = "12px monospace";
        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.fillText(this._globalDebugText, this.canvas.width, 10);

        ctx.restore();

        if (this.opts.includeBaseMap) {
            fs.writeFileSync(this.opts.outFolder + `tick-${game.getCurrentTick()}.png`, this.canvas.toBuffer("image/png"));
        }

        // repeat for any grid caches
        if (this.opts.includeHeatmaps) {
            for (const { grid, tag }  of this._debugGridCaches) {
                const gridCanvas = createCanvas(this.canvas.width, this.canvas.height);
                const gridCtx = gridCanvas.getContext('2d');
                gridCtx.drawImage(this.canvas, 0, 0);
                
                gridCtx.font = "30px monospace";
                gridCtx.fillStyle = "white";
                gridCtx.fillText(tag, 300, 30);

                this.renderGridCache(gridCtx, game, grid);
                fs.writeFileSync(this.opts.outFolder + `${tag}-tick-${game.getCurrentTick()}.png`, gridCanvas.toBuffer("image/png"));
            }
        }

        if (this._debugMessages.length > 0) {
            this.lastSeenMessage = this._debugMessages[this._debugMessages.length - 1];
        }
    }

    private renderBaseTile(ctx: CanvasRenderingContext2D, tile: Tile) {
        ctx.save();
        switch (tile.landType) {
            case LandType.Water:
                ctx.fillStyle = "#4060ff";
                break;
            case LandType.Road:
                ctx.fillStyle = "#a0a0a0";
                break;
            case LandType.Cliff:
            case LandType.Rock:
                ctx.fillStyle = "#808080";
                break;
            default:
                // tiberium is included in base land because we use resource overlay
                ctx.fillStyle = "#eeffee";
        }
        ctx.fillRect(
            tile.rx * MAP_SCALE,
            tile.ry * MAP_SCALE,
            MAP_SCALE,
            MAP_SCALE
        );
        ctx.restore();
    }

    private renderQueueInfo(ctx: CanvasRenderingContext2D, game: GameApi) {
        ctx.save();

        ctx.font = "20px monospace";
        ctx.fillStyle = "white";
        ctx.fillText(`Production Queues:`, 0, 100);
        let y = 120;
        for (const queueType of QUEUES) {
            const queue = this.productionApi.getQueueData(queueType);
            const status = queue.status === QueueStatus.Active ? "▶" :
                queue.status === QueueStatus.OnHold ? "||" :
                queue.status === QueueStatus.Idle ? "■" : "✓";
            const head = queue.items[0] ? `: ${queue.items[0].rules.name} x ${queue.items[0].quantity}` : '';
            ctx.fillText(`${queueTypeToName(queueType)} ${status}${head}`, 0, y);                
            y += 20;
        }

        ctx.restore();
    }

    private renderResourceOverlay(ctx: CanvasRenderingContext2D, game: GameApi) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        const resTiles = game.mapApi.getAllTilesResourceData();
        for (const resTile of resTiles) {
            if (resTile.gems > 0) {
                ctx.fillStyle = "#00ffff";
            } else if (resTile.ore > 0) {
                ctx.fillStyle = "#ffff00";
            }
            ctx.fillRect(
                resTile.tile.rx * MAP_SCALE,
                resTile.tile.ry * MAP_SCALE,
                MAP_SCALE,
                MAP_SCALE
            );
        }
        ctx.restore();
    }

    private renderUnitInfo(ctx: CanvasRenderingContext2D, game: GameApi) {
        const canvasWidth = this.canvas!.width;
        ctx.save();
        ctx.font = "10px monospace";
        ctx.fillStyle = "white";
        const playerToColor = new Map<string, string>();
        for (const name of game.getPlayers()) {
            const player = game.getPlayerData(name);
            if (name === this.name) {
                playerToColor.set(name, "lime");
            } else if (game.areAlliedPlayers(this.name, name)) {
                playerToColor.set(name, "blue");
            } else if (player.isCombatant){
                playerToColor.set(name, "red");
            }
        }

        ctx.save();
        let yLeft = 400, yRight = 400;
        ctx.strokeStyle = "white";
        ctx.strokeText("Friendly", 0, yLeft);
        ctx.textAlign = "right";
        ctx.strokeText("Enemy", canvasWidth, yRight);

        ctx.strokeStyle = "black";

        const allUnits = game.getAllUnits().map((uId) => game.getGameObjectData(uId)).filter((u): u is UnitData => !!u);
        for (const unit of allUnits) {
            // draw tiles
            ctx.fillStyle = playerToColor.get(unit.owner) || "grey";
            ctx.fillRect(
                unit.tile.rx * MAP_SCALE,
                unit.tile.ry * MAP_SCALE,
                unit.foundation.width * MAP_SCALE,
                unit.foundation.height * MAP_SCALE
            );
            
            // draw text
            let x = 0;
            let y: number = -1;
            if (this.name === unit.owner || game.areAlliedPlayers(this.name, unit.owner)) {
                ctx.textAlign = "left";
                yLeft += 10;
                y = yLeft;
            } else {
                x = canvasWidth;
                ctx.textAlign = "right";
                yRight += 10;
                y = yRight;
            }
            ctx.fillText(`${unit.id} ${unit.name} ${unit.hitPoints}/${unit.maxHitPoints}`, x, y);
        }
        ctx.restore();

        ctx.font = "8px monospace";
        for (const unit of allUnits) {
            ctx.strokeText(`${unit.id}\n${unit.name}`, unit.tile.rx * MAP_SCALE, unit.tile.ry * MAP_SCALE + MAP_SCALE); // +MAP_SCALE
        }


        ctx.restore();
    }

    private renderGridCache(ctx: CanvasRenderingContext2D, game: GameApi, gridCache: IncrementalGridCache<any>) {
        ctx.save();

        const gridScale = gridCache._renderScale();

        for (let x = 0; x < gridCache.getSize().width; ++x) {
            for (let y = 0; y < gridCache.getSize().height; ++y) {
                const debugCell = gridCache._getCellDebug(x, y);
                if (!debugCell) {
                    continue;
                }
                
                // between 0.25 (never/not recently updated) and 0.75 (recently updated) alpha for the cell
                if (debugCell.lastUpdatedTick === null) {
                    ctx.globalAlpha = 0.25;
                    ctx.fillStyle = "grey";
                } else {
                    ctx.globalAlpha = Math.min(0.75, Math.max(0.25, 1 - (game.getCurrentTick() - debugCell.lastUpdatedTick) / 600));
                    const [r, g, b] = fromRGBNum(debugCell.color);
                    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                }
                ctx.fillRect(x * gridScale * MAP_SCALE, y * gridScale * MAP_SCALE, gridScale * MAP_SCALE, gridScale * MAP_SCALE);
            }
        }

        ctx.restore();
    }
}
