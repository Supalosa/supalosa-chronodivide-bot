# Copilot instructions

## Architecture and data flow

-   Monorepo with two workspaces: bot logic in [packages/chronodivide-bot](packages/chronodivide-bot) and the runner/visualiser in [packages/chronodivide-bot-driver](packages/chronodivide-bot-driver).
-   Main bot entry is `SupalosaBot` in [packages/chronodivide-bot/src/bot/bot.ts](packages/chronodivide-bot/src/bot/bot.ts), which wires `MissionController` (unit grouping/commands), `QueueController` (production/placement), and `MatchAwareness` (map/threat caches) on each tick.
-   Mission orchestration lives under [packages/chronodivide-bot/src/bot/logic/mission](packages/chronodivide-bot/src/bot/logic/mission); `MissionController` handles unit assignment, action batching, and mission lifecycle in [packages/chronodivide-bot/src/bot/logic/mission/missionController.ts](packages/chronodivide-bot/src/bot/logic/mission/missionController.ts).
-   Map/threat awareness uses `SectorCache`, `BuildSpaceCache`, and a quadtree for hostiles in [packages/chronodivide-bot/src/bot/logic/awareness.ts](packages/chronodivide-bot/src/bot/logic/awareness.ts); debug grid caches are surfaced for visualisation.
-   Driver entry is [packages/chronodivide-bot-driver/src/index.ts](packages/chronodivide-bot-driver/src/index.ts): initializes `cdapi` with `MIX_DIR`, builds offline/online settings, and runs games. Use `VisualisedBot` in [packages/chronodivide-bot-driver/src/visualisation/visualisedBot.ts](packages/chronodivide-bot-driver/src/visualisation/visualisedBot.ts) to dump PNG snapshots to debug/.

## Workflows and commands

-   Build all workspaces from repo root: `npm run build`; watch mode: `npm run watch` (root scripts in [package.json](package.json)).
-   Run headless matches from the driver workspace: set `MIX_DIR` then `npm start` (see steps in [README.md](README.md)). If you don't have game files, extract `headless-mix.zip` in [packages/chronodivide-bot-driver/data](packages/chronodivide-bot-driver/data) and point `MIX_DIR` to `packages/chronodivide-bot-driver/data/headless-mix`.
-   Online play requires `.env` values described in [README.md](README.md); start with `ONLINE_MATCH=1` when needed.
-   Tests are only in the driver workspace via Vitest: `npm run test` in [packages/chronodivide-bot-driver](packages/chronodivide-bot-driver).

## Project-specific conventions

-   **Filenames use camelCase**: `missionController.ts`, `alliedCompositions.ts`, `soviet.ts` (not PascalCase or snake_case).
-   ESM TypeScript is used; imports include `.js` extensions even in `.ts` files (see [packages/chronodivide-bot/src/bot/bot.ts](packages/chronodivide-bot/src/bot/bot.ts) and [packages/chronodivide-bot-driver/src/index.ts](packages/chronodivide-bot-driver/src/index.ts)).
-   Debug text and unit labels only appear when `setDebugMode(true)` is enabled on a bot instance (see `VisualisedBot` usage in [packages/chronodivide-bot-driver/src/index.ts](packages/chronodivide-bot-driver/src/index.ts)).
-   Headless assets live in [packages/chronodivide-bot-driver/data](packages/chronodivide-bot-driver/data); see constraints in [packages/chronodivide-bot-driver/data/README.md](packages/chronodivide-bot-driver/data/README.md). Extract `headless-mix.zip` in that directory to get required MIX files for headless mode.
