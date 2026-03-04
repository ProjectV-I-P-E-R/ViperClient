export enum KnownEntityType {
    Aircraft = "Aircraft",
    Orbital = "Orbital",
    Camera = "Camera",
    FieldAgent = "FieldAgent",
    Vessel = "Vessel",
    SignalNode = "SignalNode",
    HeatSpot = "HeatSpot",
    Unknown = "Unknown"
}

export type EntityType = KnownEntityType | string;

export interface TrackedObject {
    id: string;
    entity_type: EntityType;
    callsign: string | null;
    lat: number;
    lon: number;
    altitude: number;
    heading: number;
    velocity: number;
    tags: Record<string, string>;
    metadata?: Record<string, any>;
    orbitalData?: {
        satrec?: any;
    };
}

export interface EntityDeltaBatch {
    timestamp: number;
    updates: TrackedObject[];
    removals: string[];
}
