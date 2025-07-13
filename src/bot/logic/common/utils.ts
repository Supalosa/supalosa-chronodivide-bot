import { GameObjectData, TechnoRules, UnitData } from "@chronodivide/game-api";

export enum Countries {
    USA = "Americans",
    KOREA = "Alliance",
    FRANCE = "French",
    GERMANY = "Germans",
    GREAT_BRITAIN = "British",
    LIBYA = "Africans",
    IRAQ = "Arabs",
    CUBA = "Confederation",
    RUSSIA = "Russians",
}

export type DebugLogger = (message: string, sayInGame?: boolean) => void;

export const isOwnedByNeutral = (unitData: UnitData | undefined) => unitData?.owner === "@@NEUTRAL@@";

// Return if the given unit would have .isSelectableCombatant = true.
// Usable on GameObjectData (which is faster to get than TechnoRules)
export const isSelectableCombatant = (rules: GameObjectData | undefined) =>
    !!(rules?.rules as any)?.isSelectableCombatant;

// Thanks use-strict!
export function formatTimeDuration(timeSeconds: number, skipZeroHours = false) {
    let h = Math.floor(timeSeconds / 3600);
    timeSeconds -= h * 3600;
    let m = Math.floor(timeSeconds / 60);
    timeSeconds -= m * 60;
    let s = Math.floor(timeSeconds);

    return [...(h || !skipZeroHours ? [h] : []), pad(m, "00"), pad(s, "00")].join(":");
}

export function pad(n: any, format = "0000") {
    let str = "" + n;
    return format.substring(0, format.length - str.length) + str;
}

// So we don't need lodash
export function minBy<T>(array: T[], predicate: (arg: T) => number | null): T | null {
    if (array.length === 0) {
        return null;
    }
    let minIdx = 0;
    let minVal = predicate(array[0]);
    for (let i = 1; i < array.length; ++i) {
        const newVal = predicate(array[i]);
        if (minVal === null || (newVal !== null && newVal < minVal)) {
            minIdx = i;
            minVal = newVal;
        }
    }
    return minVal !== null ? array[minIdx] : null;
}

export function maxBy<T>(array: T[], predicate: (arg: T) => number | null): T | null {
    if (array.length === 0) {
        return null;
    }
    let maxIdx = 0;
    let maxVal = predicate(array[0]);
    for (let i = 1; i < array.length; ++i) {
        const newVal = predicate(array[i]);
        if (maxVal === null || (newVal !== null && newVal > maxVal)) {
            maxIdx = i;
            maxVal = newVal;
        }
    }
    return maxVal !== null ? array[maxIdx] : null;
}

export function uniqBy<T>(array: T[], predicate: (arg: T) => string | number): T[] {
    return Object.values(
        array.reduce(
            (prev, newVal) => {
                const val = predicate(newVal);
                if (!prev[val]) {
                    prev[val] = newVal;
                }
                return prev;
            },
            {} as Record<string, T>,
        ),
    );
}

export function countBy<T>(array: T[], predicate: (arg: T) => string | undefined): { [key: string]: number } {
    return array.reduce(
        (prev, newVal) => {
            const val = predicate(newVal);
            if (val === undefined) {
                return prev;
            }
            if (!prev[val]) {
                prev[val] = 0;
            }
            prev[val] = prev[val] + 1;
            return prev;
        },
        {} as Record<string, number>,
    );
}

export function groupBy<K extends string, V>(array: V[], predicate: (arg: V) => K): { [key in K]: V[] } {
    return array.reduce(
        (prev, newVal) => {
            const val = predicate(newVal);
            if (val === undefined) {
                return prev;
            }
            if (!prev.hasOwnProperty(val)) {
                prev[val] = [];
            }
            prev[val].push(newVal);
            return prev;
        },
        {} as Record<K, V[]>,
    );
}

export function setDifference<T>(a: Set<T>, b: Set<T>): T[] {
    const map = new Map<T, number>();
    a.forEach((v) => map.set(v, 1));
    b.forEach((v) => map.set(v, (map.get(v) ?? 0) + 1));
    return [...map.entries()].filter(([key, val]) => val !== 2).map(([key]) => key);
}
