/**
 * Very lightweight in-process event bus for bot logic.
 */

// --- Event definitions ---------------------------------------------------

export type NavalEvent = {
    type: "yardFailed";     // a Naval Yard finished production but could not be placed
    player: string;          // owning player name
};

export type BotEvent = NavalEvent; // | OtherFutureEvents

// -------------------------------------------------------------------------

type Listener = (event: BotEvent) => void;

const listeners: Set<Listener> = new Set();

/**
 * Subscribe to all bot events. Returns an `unsubscribe` function.
 */
export function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Publish an event to all listeners (synchronous). */
export function publish(event: BotEvent): void {
    listeners.forEach((l) => l(event));
}
