export type DebugLogger = (message: string, sayInGame?: boolean) => void;

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
