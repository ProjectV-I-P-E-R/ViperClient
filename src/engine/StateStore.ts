import { TrackedObject } from "./types";

export interface StateMutation {
    updates?: TrackedObject[];
    removals?: string[];
    isSnapshot?: boolean;
}

export type StateStoreListener = (mutation: StateMutation, fullState: Record<string, TrackedObject>) => void;

export class StateStore {
    private state: Record<string, TrackedObject> = {};
    private listeners: Set<StateStoreListener> = new Set();

    public update(batch: { updates?: TrackedObject[], removals?: string[] }) {
        let changed = false;

        if (batch.updates) {
            for (const obj of batch.updates) {
                const existing = this.state[obj.id];
                if (existing) {
                    Object.assign(existing, obj);
                } else {
                    this.state[obj.id] = obj;
                }
                changed = true;
            }
        }

        if (batch.removals) {
            for (const id of batch.removals) {
                if (this.state[id]) {
                    delete this.state[id];
                    changed = true;
                }
            }
        }

        if (changed) {
            this.notify({ updates: batch.updates, removals: batch.removals, isSnapshot: false });
        }
    }

    public seed(objects: TrackedObject[]) {
        this.state = {};
        for (const obj of objects) {
            this.state[obj.id] = obj;
        }
        this.notify({ updates: objects, isSnapshot: true });
    }

    public get(id: string): TrackedObject | undefined {
        return this.state[id];
    }

    public getAll(): Record<string, TrackedObject> {
        return this.state;
    }

    public subscribe(listener: StateStoreListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify(mutation: StateMutation) {
        this.listeners.forEach(listener => listener(mutation, this.state));
    }
}

export const centralStateStore = new StateStore();
