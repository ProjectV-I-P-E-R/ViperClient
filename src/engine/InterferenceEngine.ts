import * as Cesium from "cesium";
import { latLngToCell, cellToBoundary } from "h3-js";
import { centralStateStore } from "./StateStore";
import { TrackedObject } from "./types";

const H3_RESOLUTION = 3;

export class InterferenceEngine {
    private viewer: Cesium.Viewer;
    private unsubscribe: (() => void) | null = null;
    
    private primitiveCollection: Cesium.PrimitiveCollection;
    private activePrimitive: Cesium.Primitive | null = null;
    private currentHexes: Map<string, number> = new Map();
    
    private enabled: boolean = false;
    private updateTimeout: any = null;
    public onLoadingChange: ((isLoading: boolean) => void) | null = null;

    constructor(viewer: Cesium.Viewer) {
        this.viewer = viewer;
        this.primitiveCollection = new Cesium.PrimitiveCollection();
        this.viewer.scene.primitives.add(this.primitiveCollection);
    }

    public setEnabled(enabled: boolean) {
        this.enabled = enabled;
        console.log(`[InterferenceEngine] Enabled: ${enabled}`);
        
        this.primitiveCollection.show = enabled;
        
        if (enabled) {
            this.debouncedUpdate(centralStateStore.getAll());
        }
    }

    public start() {
        this.unsubscribe = centralStateStore.subscribe((_, fullState) => {
            if (this.enabled) {
                this.debouncedUpdate(fullState);
            }
        });
    }

    public stop() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }
        this.enabled = false;
        this.clear();
        this.viewer.scene.primitives.remove(this.primitiveCollection);
    }

    private clear() {
        this.primitiveCollection.removeAll();
        this.activePrimitive = null;
        this.currentHexes.clear();
    }

    private debouncedUpdate(state: Record<string, TrackedObject>) {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        } else if (this.enabled && this.onLoadingChange) {
            this.onLoadingChange(true);
        }
        
        this.updateTimeout = setTimeout(() => {
            this.updateTimeout = null;
            this.update(state);
            if (this.enabled && this.onLoadingChange) {
                this.onLoadingChange(false);
            }
        }, 1000);
    }

    private update(state: Record<string, TrackedObject>) {
        const newHexData: Map<string, number> = new Map();
        let aircraftCount = 0;
        let interferenceFound = 0;

        for (const obj of Object.values(state)) {
            const isAircraft = obj.entity_type === "Aircraft" || obj.entity_type === "aircraft";
            if (isAircraft) {
                aircraftCount++;
                
                const tags = obj.tags || {};
                const metadata = obj.metadata || {};
                
                const interferenceRaw = tags.gps_interference || 
                                     metadata.gps_interference || 
                                     tags.jamming || 
                                     metadata.jamming ||
                                     tags.interference ||
                                     metadata.interference ||
                                     (obj as any).interference ||
                                     (obj as any).jamming;
                
                if (interferenceRaw !== undefined) {
                    const value = parseFloat(interferenceRaw.toString());
                    if (!isNaN(value)) {
                        let normalized = value;
                        if (value > 10) normalized = value / 100;
                        else if (value > 1) normalized = value / 10;
                        
                        if (normalized >= 0.05) {
                            interferenceFound++;
                            const lat = Number(obj.lat);
                            const lon = Number(obj.lon);
                            
                            if (!isNaN(lat) && !isNaN(lon)) {
                                try {
                                    const h3Index = latLngToCell(lat, lon, H3_RESOLUTION);
                                    const currentMax = newHexData.get(h3Index) || 0;
                                    if (value > currentMax) {
                                        newHexData.set(h3Index, value);
                                    }
                                } catch (e) {
                                }
                            }
                        }
                    }
                }
            }
        }

        if (this.enabled && aircraftCount > 0) {
            console.log(`[InterferenceEngine] Status: ${aircraftCount} aircraft scanned, ${interferenceFound} with interference, ${newHexData.size} hexes generated.`);
        }

        let dataChanged = false;
        if (newHexData.size !== this.currentHexes.size) {
            dataChanged = true;
        } else {
            for (const [key, val] of newHexData.entries()) {
                if (this.currentHexes.get(key) !== val) {
                    dataChanged = true;
                    break;
                }
            }
        }

        if (!dataChanged) {
            return;
        }

        this.currentHexes = new Map(newHexData);

        if (this.activePrimitive) {
            this.primitiveCollection.remove(this.activePrimitive);
            this.activePrimitive = null;
        }

        const instances: Cesium.GeometryInstance[] = [];

        newHexData.forEach((value, h3Index) => {
            try {
                const color = this.getColorForInterference(value);
                const translucentColor = color.withAlpha(0.6);
                
                const boundary = cellToBoundary(h3Index);
                const positions = boundary.map(coord => Cesium.Cartesian3.fromDegrees(coord[1], coord[0], 25000));
                
                const polygon = new Cesium.PolygonGeometry({
                    polygonHierarchy: new Cesium.PolygonHierarchy(positions),
                    extrudedHeight: 10000,
                    height: 3000,
                    vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT
                });

                const instance = new Cesium.GeometryInstance({
                    geometry: polygon,
                    attributes: {
                        color: Cesium.ColorGeometryInstanceAttribute.fromColor(translucentColor)
                    },
                    id: `h3-interference-${h3Index}`
                });
                
                instances.push(instance);
                
            } catch (e) {
                console.error(`[InterferenceEngine] Error creating hex ${h3Index}:`, e);
            }
        });

        if (instances.length > 0) {
            this.activePrimitive = new Cesium.Primitive({
                geometryInstances: instances,
                appearance: new Cesium.PerInstanceColorAppearance({
                    closed: true,
                    translucent: true
                }),
                asynchronous: true,
                releaseGeometryInstances: true
            });
            
            this.primitiveCollection.add(this.activePrimitive);
        }
    }

    private getColorForInterference(value: number): Cesium.Color {
        let normalized = value;
        if (value > 10) normalized = value / 100;
        else if (value > 1) normalized = value / 10;

        if (normalized < 0.33) return Cesium.Color.YELLOW;
        if (normalized < 0.66) return Cesium.Color.ORANGE;
        return Cesium.Color.RED;
    }
}
