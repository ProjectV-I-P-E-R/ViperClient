import { centralStateStore } from "./StateStore";
import { TrackedObject } from "./types";
import { WsClient } from "@/lib/wsClient.ts";

export class NetworkLayer {
    private wsClient: WsClient | null = null;
    private snapshotUrl: string;
    private wsUrl: string;

    constructor(snapshotUrl: string, wsUrl: string) {
        this.snapshotUrl = snapshotUrl;
        this.wsUrl = wsUrl;
    }

    public async initialize() {
        try {
            const snapshotRes = await fetch(this.snapshotUrl);
            if (!snapshotRes.ok) throw new Error(`Snapshot failed: ${snapshotRes.statusText}`);
            const dynamicObjects: TrackedObject[] = await snapshotRes.json();
            
            const orbitalsUrl = this.snapshotUrl.replace("/snapshot", "/orbitals");
            const orbitalsRes = await fetch(orbitalsUrl);
            let orbitalObjects: TrackedObject[] = [];
            
            if (orbitalsRes.ok) {
                const sats = await orbitalsRes.json();
                orbitalObjects = sats.map((sat: any) => ({
                    id: `sat:${sat.NORAD_CAT_ID}`,
                    callsign: sat.OBJECT_NAME,
                    lat: 0,
                    lon: 0,
                    altitude: 0,
                    heading: 0,
                    velocity: 0,
                    entity_type: "Orbital",
                    tags: {
                        orbital_gp: JSON.stringify(sat)
                    }
                }));
                console.log(`[NetworkLayer] Orbitals fetched: ${orbitalObjects.length}`);
            }

            const fullSnapshot = [...dynamicObjects, ...orbitalObjects];
            console.log(`[NetworkLayer] Initial Seed: ${fullSnapshot.length} total objects`);
            centralStateStore.seed(fullSnapshot);

            console.log(`[NetworkLayer] Connecting to WebSocket: ${this.wsUrl}`);
            this.wsClient = new WsClient(this.wsUrl);
            this.wsClient.onMessage((msg: any) => {
                if (msg.updates || msg.removals) {
                    centralStateStore.update({
                        updates: msg.updates,
                        removals: msg.removals
                    });
                } else if (Array.isArray(msg)) {
                    const noOrbitals = msg.filter(o => o.entity_type !== "Orbital");
                    centralStateStore.seed([...noOrbitals, ...orbitalObjects]);
                } else if (msg.objects) {
                    const noOrbitals = msg.objects.filter((o: any) => o.entity_type !== "Orbital");
                    centralStateStore.seed([...noOrbitals, ...orbitalObjects]);
                }
            });

            this.wsClient.connect();
        } catch (error) {
            console.error("[NetworkLayer] Initialization failed:", error);
        }
    }

    public disconnect() {
        if (this.wsClient) {
            this.wsClient.disconnect();
            this.wsClient = null;
        }
    }
}
