import { GameApi, TechnoRules } from "@chronodivide/game-api";

/**
 * TechnoRules caching helper
 * -------------------------
 *
 * Each ChronoDivide `GameApi` instance owns its **own** `rulesApi`. The
 * concrete rulesets (unit stats, weapon stats, etc.) might differ between
 * games because maps can override them.  We therefore need a cache that is
 * *scoped* to the lifetime of the corresponding `rulesApi` instead of a
 * process-wide singleton.
 *
 * A `WeakMap` is used so that once a game is disposed and its `rulesApi`
 * object becomes unreachable, the cache entry is removed automatically by
 * the garbage collector – giving us an elegant, maintenance-free clearing
 * mechanism.
 */

type TechnoRulesCache = { [rulesName: string]: TechnoRules | null };

/**
 * Key:   the `rulesApi` object (unique per game instance)
 * Value: cache object holding TechnoRules look-ups for that game.
 */
const cacheByRulesApi: WeakMap<any, TechnoRulesCache> = new WeakMap();

/**
 * Fetch TechnoRules for the given unitId using a per-game cache.
 */
export const getCachedTechnoRules = (
    gameApi: GameApi,
    unitId: number,
): TechnoRules | null => {
    // Obtain or create the cache for the current game's rulesApi.
    const { rulesApi } = gameApi;
    let technoRulesCache = cacheByRulesApi.get(rulesApi);
    if (!technoRulesCache) {
        technoRulesCache = {};
        cacheByRulesApi.set(rulesApi, technoRulesCache);
    }

    const gameObject = gameApi.getGameObjectData(unitId);
    if (!gameObject) {
        return null;
    }

    const { name } = gameObject;

    if (name in technoRulesCache) {
        // Cached either with TechnoRules or null.
        return technoRulesCache[name]!;
    }

    // First time we encounter this object for this game – look it up.
    const aircraftRules = rulesApi.aircraftRules.get(name);
    if (aircraftRules) {
        technoRulesCache[name] = aircraftRules;
        return aircraftRules;
    }

    const buildingRules = rulesApi.buildingRules.get(name);
    if (buildingRules) {
        technoRulesCache[name] = buildingRules;
        return buildingRules;
    }

    const infantryRules = rulesApi.infantryRules.get(name);
    if (infantryRules) {
        technoRulesCache[name] = infantryRules;
        return infantryRules;
    }

    const vehicleRules = rulesApi.vehicleRules.get(name);
    if (vehicleRules) {
        technoRulesCache[name] = vehicleRules;
        return vehicleRules;
    }

    // Negative cache – remember that this object has no TechnoRules.
    technoRulesCache[name] = null;
    return null;
};
