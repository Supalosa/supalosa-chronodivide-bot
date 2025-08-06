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

export class EventBus {
    private listeners: Set<Listener> = new Set();

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    publish(event: BotEvent): void {
        this.listeners.forEach((l) => l(event));
    }
}
