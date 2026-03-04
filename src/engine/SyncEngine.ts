import * as Cesium from "cesium";
import { centralStateStore, StateMutation } from "./StateStore";
import { rendererRegistry } from "./RendererRegistry";
import { TrackedObject } from "./types";
import { isEntityVisible, categorizeEntity, getColorForEntity } from "@/lib/viper/entityUtils.ts";
import { processOrbitalData, computeOrbitPath } from "@/lib/viper/orbitalUtils.ts";
import * as satellite from "satellite.js";

const scratchTransform = new Cesium.Matrix4();
const scratchOffset = new Cesium.Cartesian3();
const scratchNewPos = new Cesium.Cartesian3();
const scratchEnuTransform = new Cesium.Matrix4();
const scratchLocalOffset = new Cesium.Cartesian3();
const scratchGlobalOffset = new Cesium.Cartesian3();
const scratchOcclusionPos = new Cesium.Cartesian3();

interface DynamicNode {
    id: string;
    obj: TrackedObject;
    type: string;
    subtype: string;
    point?: Cesium.PointPrimitive;
    billboard?: Cesium.Billboard;
    satrec?: satellite.SatRec | null;
    lastUpdateMs: number;
    basePos: Cesium.Cartesian3;
    filterVisible: boolean;
}

export const selectionStore = {
    targetId: null as string | null,
    listeners: new Set<(id: string | null) => void>(),
    setTarget(id: string | null) {
        this.targetId = id;
        this.listeners.forEach(l => l(id));
    },
    subscribe(l: (id: string | null) => void) {
        this.listeners.add(l);
        return () => this.listeners.delete(l);
    }
};

export class SyncEngine {
    private viewer: Cesium.Viewer;
    private unsubscribe: (() => void) | null = null;
    private removeTickListener: (() => void) | null = null;
    
    private pointPrimitives: Cesium.PointPrimitiveCollection;
    private billboardPrimitives: Cesium.BillboardCollection;
    private polylinePrimitives: Cesium.PolylineCollection;
    
    private nodes: Map<string, DynamicNode> = new Map();
    private currentPolylines: Map<string, Cesium.Polyline> = new Map();
    
    private filters: any = {};
    private doubleClickHandler: Cesium.ScreenSpaceEventHandler;
    private filterUpdateTimeout: any = null;

    constructor(viewer: Cesium.Viewer) {
        this.viewer = viewer;
        this.pointPrimitives = viewer.scene.primitives.add(new (Cesium as any).PointPrimitiveCollection({
            scene: viewer.scene
        }));
        this.billboardPrimitives = viewer.scene.primitives.add(new (Cesium as any).BillboardCollection({
            scene: viewer.scene
        }));
        this.polylinePrimitives = viewer.scene.primitives.add(new Cesium.PolylineCollection());
        
        this.doubleClickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        this.doubleClickHandler.setInputAction((movement: any) => {
            const picked = viewer.scene.pick(movement.position);
            if (picked && picked.id) {
                selectionStore.setTarget(picked.id);
                
                const targetNode = this.nodes.get(picked.id);
                if (targetNode) {
                    const pos = targetNode.billboard?.position || targetNode.point?.position;
                    if (pos) {
                        const isOrbital = !!targetNode.satrec;
                        const targetDist = isOrbital ? 15000 : 8000;
                        const transform = Cesium.Transforms.eastNorthUpToFixedFrame(pos, undefined, scratchTransform);
                        
                        let targetHeading = this.viewer.camera.heading;
                        if (targetNode.obj.entity_type === "Aircraft" || targetNode.obj.entity_type === "Vessel") {
                            targetHeading = Cesium.Math.toRadians(targetNode.obj.heading || 0);
                        }
                        
                        this.viewer.camera.lookAtTransform(transform, new Cesium.HeadingPitchRange(
                            targetHeading, 
                            Cesium.Math.toRadians(-30),
                            targetDist
                        ));
                    }
                }
                
            } else {
                selectionStore.setTarget(null);
                this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    }

    public updateFilters(filters: any) {
        this.filters = filters;
        if (this.filterUpdateTimeout) {
            clearTimeout(this.filterUpdateTimeout);
        }
        
        const nodesArray = Array.from(this.nodes.values());
        const chunkSize = 2000;
        let currentIdx = 0;

        const processChunk = () => {
            const endIdx = Math.min(currentIdx + chunkSize, nodesArray.length);
            for (let i = currentIdx; i < endIdx; i++) {
                const node = nodesArray[i];
                const isVisible = isEntityVisible(node.type, node.subtype, this.filters);
                
                node.filterVisible = isVisible;
                
                if (node.point) node.point.show = isVisible;
                if (node.billboard) node.billboard.show = isVisible;
                
                const polyline = this.currentPolylines.get(node.id);
                if (polyline) {
                    const isTracked = selectionStore.targetId === node.id;
                    polyline.show = isVisible && this.filters.showOrbitPaths && (isTracked || this.nodes.size < 100);
                } else if (node.type === "Orbital" && isVisible && this.filters.showOrbitPaths) {
                    const isTracked = selectionStore.targetId === node.id;
                    if (isTracked) {
                        this.addOrbitPath(node.obj);
                    }
                }
            }

            currentIdx = endIdx;
            if (currentIdx < nodesArray.length) {
                this.filterUpdateTimeout = setTimeout(processChunk, 0);
            } else {
                this.filterUpdateTimeout = null;
                this.viewer.scene.requestRender();
            }
        };

        processChunk();
    }

    public start() {
        this.unsubscribe = centralStateStore.subscribe((mutation, fullState) => {
            if (mutation.isSnapshot) {
                this.reset(fullState);
            } else {
                this.applyMutation(mutation);
            }
        });
        
        this.removeTickListener = this.viewer.clock.onTick.addEventListener((clock) => {
            const now = Cesium.JulianDate.toDate(clock.currentTime);
            const nowMs = Date.now();
            
            let moved = false;
            moved = this.propagateNodes(now, nowMs) || moved;
            
            if (selectionStore.targetId) {
                const targetNode = this.nodes.get(selectionStore.targetId);
                if (targetNode) {
                    const pos = targetNode.billboard?.position || targetNode.point?.position;
                    if (pos) {
                        const transform = Cesium.Transforms.eastNorthUpToFixedFrame(pos, undefined, scratchTransform);
                        const currentDist = Cesium.Cartesian3.distance(this.viewer.camera.positionWC, pos);
                        const safeDist = (Number.isFinite(currentDist) && currentDist > 0) ? currentDist : 1000000;
                        
                        let targetHeading = this.viewer.camera.heading;
                        if (targetNode.obj.entity_type === "Aircraft" || targetNode.obj.entity_type === "Vessel") {
                            targetHeading = Cesium.Math.toRadians(targetNode.obj.heading || 0);
                        }
                        
                        this.viewer.camera.lookAtTransform(transform, new Cesium.HeadingPitchRange(
                            targetHeading, 
                            this.viewer.camera.pitch, 
                            safeDist
                        ));

                        if (targetNode.satrec && this.filters.showOrbitPaths && !this.currentPolylines.has(targetNode.id)) {
                            this.addOrbitPath(targetNode.obj);
                        }
                    }
                }
            }

            if (moved || selectionStore.targetId) {
                this.viewer.scene.requestRender();
            }
        });

        const initialState = centralStateStore.getAll();
        if (Object.keys(initialState).length > 0) {
            this.reset(initialState);
        }
    }

    public stop() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        if (this.removeTickListener) {
            this.removeTickListener();
            this.removeTickListener = null;
        }
        if (this.filterUpdateTimeout) {
            clearTimeout(this.filterUpdateTimeout);
            this.filterUpdateTimeout = null;
        }
        this.doubleClickHandler.destroy();
        this.viewer.scene.primitives.remove(this.pointPrimitives);
        this.viewer.scene.primitives.remove(this.billboardPrimitives);
        this.viewer.scene.primitives.remove(this.polylinePrimitives);
    }

    private reset(state: Record<string, TrackedObject>) {
        this.pointPrimitives.removeAll();
        this.billboardPrimitives.removeAll();
        this.polylinePrimitives.removeAll();
        this.nodes.clear();
        this.currentPolylines.clear();

        for (const obj of Object.values(state)) {
            this.addNode(obj);
        }
        this.viewer.scene.requestRender();
    }

    private applyMutation(mutation: StateMutation) {
        if (mutation.removals) {
            for (const id of mutation.removals) {
                const node = this.nodes.get(id);
                if (node) {
                    if (node.point) this.pointPrimitives.remove(node.point);
                    if (node.billboard) this.billboardPrimitives.remove(node.billboard);
                    this.nodes.delete(id);
                }
                const pl = this.currentPolylines.get(id);
                if (pl) {
                    this.polylinePrimitives.remove(pl);
                    this.currentPolylines.delete(id);
                }
                if (selectionStore.targetId === id) {
                    selectionStore.setTarget(null);
                    this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
                }
            }
        }

        if (mutation.updates) {
            for (const obj of mutation.updates) {
                const existing = this.nodes.get(obj.id);
                if (existing) {
                    this.updateNode(existing, obj);
                } else {
                    this.addNode(obj);
                }
            }
        }
    }

    private addOrbitPath(obj: TrackedObject) {
        if (this.currentPolylines.has(obj.id)) return;
        
        const now = Cesium.JulianDate.toDate(this.viewer.clock.currentTime);
        const { satrec } = processOrbitalData(obj, now);
        
        if (satrec) {
            const pathPositions = computeOrbitPath(satrec, now);
            if (pathPositions.length > 0) {
                const { type } = categorizeEntity(obj);
                const color = getColorForEntity(type, obj.callsign || undefined);
                const transparentColor = new Cesium.Color(color.red, color.green, color.blue, 0.3);
                
                const polyline = this.polylinePrimitives.add({
                    positions: pathPositions,
                    width: 1,
                    material: Cesium.Material.fromType('Color', { color: transparentColor }),
                    show: this.filters.showOrbitPaths
                });
                this.currentPolylines.set(obj.id, polyline);
            }
        }
    }

    private addNode(obj: TrackedObject) {
        const renderer = rendererRegistry.get(obj.entity_type);
        if (!renderer) return;

        const options = renderer(obj);
        const { type, subtype } = categorizeEntity(obj);
        const isVisible = isEntityVisible(type, subtype, this.filters);

        obj.velocity = Number(obj.velocity) || Number((obj as any).speed) || 0;
        obj.heading = Number(obj.heading) || 0;
        obj.altitude = Number(obj.altitude) || 0;
        obj.lat = Number(obj.lat) || 0;
        obj.lon = Number(obj.lon) || 0;

        const now = Cesium.JulianDate.toDate(this.viewer.clock.currentTime);
        const nowMs = Date.now();
        const { pos, satrec } = processOrbitalData(obj, now);
        
        let altMeters = type === "Aircraft" ? obj.altitude * 0.3048 : obj.altitude;
        if (type === "Vessel" && altMeters === 0) altMeters = 2.0;

        const basePos = pos || Cesium.Cartesian3.fromDegrees(obj.lon, obj.lat, altMeters);

        const node: DynamicNode = {
            id: obj.id,
            obj,
            type,
            subtype,
            lastUpdateMs: nowMs,
            basePos: Cesium.Cartesian3.clone(basePos),
            satrec,
            filterVisible: isVisible
        };

        if (options.billboard) {
            node.billboard = this.billboardPrimitives.add({
                id: obj.id,
                position: basePos,
                image: options.billboard.image,
                color: options.billboard.color || Cesium.Color.WHITE,
                width: options.billboard.width || 24,
                height: options.billboard.height || 24,
                rotation: options.billboard.rotation || 0.0,
                alignedAxis: options.billboard.alignedAxis || Cesium.Cartesian3.ZERO,
                eyeOffset: options.billboard.eyeOffset || Cesium.Cartesian3.ZERO,
                verticalOrigin: options.billboard.verticalOrigin !== undefined ? options.billboard.verticalOrigin : Cesium.VerticalOrigin.CENTER,
                show: isVisible,
                distanceDisplayCondition: options.billboard.distanceDisplayCondition
            });
        } else if (options.point) {
            node.point = this.pointPrimitives.add({
                id: obj.id,
                position: basePos,
                color: options.point.color || Cesium.Color.WHITE,
                pixelSize: options.point.pixelSize || 4,
                outlineColor: options.point.outlineColor || Cesium.Color.BLACK,
                outlineWidth: options.point.outlineWidth || 1,
                show: isVisible,
                distanceDisplayCondition: options.point.distanceDisplayCondition
            });
        }

        this.nodes.set(obj.id, node);
        if (satrec && isVisible && this.filters.showOrbitPaths) {
            this.addOrbitPath(obj);
        }
    }

    private updateNode(node: DynamicNode, newObj: TrackedObject) {
        const now = Cesium.JulianDate.toDate(this.viewer.clock.currentTime);
        const nowMs = Date.now();
        const { pos, satrec } = processOrbitalData(newObj, now);
        
        const { type, subtype } = categorizeEntity(newObj);
        let altMeters = type === "Aircraft" ? (Number(newObj.altitude) || 0) * 0.3048 : (Number(newObj.altitude) || 0);
        if (type === "Vessel" && altMeters === 0) altMeters = 2.0;

        const basePos = pos || Cesium.Cartesian3.fromDegrees(Number(newObj.lon) || 0, Number(newObj.lat) || 0, altMeters, undefined, scratchNewPos);

        const vel = Number(newObj.velocity) || Number((newObj as any).speed) || 0;
        const hdg = Number(newObj.heading) || 0;
        const oldVel = Number(node.obj.velocity) || 0;
        const oldHdg = Number(node.obj.heading) || 0;

        const distMoved = Cesium.Cartesian3.distance(node.basePos, basePos);
        if (distMoved > 50.0 || Math.abs(vel - oldVel) > 1.0 || Math.abs(hdg - oldHdg) > 1.0) {
            node.lastUpdateMs = nowMs;
            Cesium.Cartesian3.clone(basePos, node.basePos);
        }

        newObj.velocity = vel;
        newObj.heading = hdg;
        node.obj = newObj;
        node.type = type;
        node.subtype = subtype;
        node.satrec = satrec;

        if (satrec || vel <= 1.0) {
            if (node.billboard) {
                node.billboard.position = basePos;
                if ((type === "Aircraft" || type === "Vessel") && hdg !== undefined) {
                    const headingRad = Cesium.Math.toRadians(hdg);
                    Cesium.Transforms.eastNorthUpToFixedFrame(basePos, undefined, scratchEnuTransform);
                    scratchLocalOffset.x = Math.sin(headingRad);
                    scratchLocalOffset.y = Math.cos(headingRad);
                    scratchLocalOffset.z = 0;
                    Cesium.Matrix4.multiplyByPointAsVector(scratchEnuTransform, scratchLocalOffset, scratchGlobalOffset);
                    Cesium.Cartesian3.normalize(scratchGlobalOffset, scratchGlobalOffset);
                    node.billboard.alignedAxis = scratchGlobalOffset;
                    node.billboard.rotation = 0;
                }
                
                const options = rendererRegistry.get(newObj.entity_type)?.(newObj);
                if (node.billboard && options?.billboard) {
                    if (options.billboard.eyeOffset) node.billboard.eyeOffset = options.billboard.eyeOffset;
                    if (options.billboard.verticalOrigin !== undefined) node.billboard.verticalOrigin = options.billboard.verticalOrigin;
                }
            }
            if (node.point) node.point.position = basePos;
        }

        if (satrec && this.filters.showOrbitPaths && !this.currentPolylines.has(node.id)) {
            this.addOrbitPath(newObj);
        }
    }

    private propagateNodes(now: Date, nowMs: number): boolean {
        let moved = false;
        const gstime = satellite.gstime(now);
        const timePulse = (nowMs % 2000) / 2000;
        
        const occluder = new (Cesium as any).EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, this.viewer.camera.positionWC);

        this.nodes.forEach((node) => {
            if (!node.filterVisible) return;

            let currentPos = node.basePos;

            if (node.obj.entity_type === "HeatSpot" && node.billboard) {
                const pulseScale = 0.8 + Math.sin(timePulse * Math.PI * 2) * 0.2;
                node.billboard.scale = pulseScale;
                moved = true;
            }

            if (node.satrec) {
                const pv = satellite.propagate(node.satrec, now);
                if (pv && pv.position) {
                    const gd = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, gstime);
                    Cesium.Cartesian3.fromDegrees(satellite.degreesLong(gd.longitude), satellite.degreesLat(gd.latitude), gd.height * 1000, undefined, scratchNewPos);
                    if (node.billboard) node.billboard.position = scratchNewPos;
                    if (node.point) node.point.position = scratchNewPos;
                    currentPos = scratchNewPos;
                    moved = true;
                }
            } else if (node.obj.velocity > 1.0) {
                const dt = (nowMs - node.lastUpdateMs) / 1000.0;
                if (dt >= 0 && dt < 600) {
                    const distance = (node.obj.velocity * 0.514444) * dt;
                    const headingRad = Cesium.Math.toRadians(node.obj.heading);
                    scratchOffset.x = Math.sin(headingRad) * distance;
                    scratchOffset.y = Math.cos(headingRad) * distance;
                    scratchOffset.z = 0;
                     Cesium.Transforms.eastNorthUpToFixedFrame(node.basePos, undefined, scratchTransform);
                    Cesium.Matrix4.multiplyByPoint(scratchTransform, scratchOffset, scratchNewPos);
                    if (node.billboard) {
                        node.billboard.position = scratchNewPos;
                        if (node.obj.entity_type === "Aircraft" || node.obj.entity_type === "Vessel") {
                            Cesium.Transforms.eastNorthUpToFixedFrame(scratchNewPos, undefined, scratchEnuTransform);
                            scratchLocalOffset.x = Math.sin(headingRad);
                            scratchLocalOffset.y = Math.cos(headingRad);
                            scratchLocalOffset.z = 0;
                            Cesium.Matrix4.multiplyByPointAsVector(scratchEnuTransform, scratchLocalOffset, scratchGlobalOffset);
                            Cesium.Cartesian3.normalize(scratchGlobalOffset, scratchGlobalOffset);
                            node.billboard.alignedAxis = scratchGlobalOffset;
                            node.billboard.rotation = 0;
                        }
                    }
                    if (node.point) node.point.position = scratchNewPos;
                    currentPos = scratchNewPos;
                    moved = true;
                }
            }

            const radialDir = Cesium.Cartesian3.normalize(currentPos, scratchOcclusionPos);
            const checkPos = Cesium.Cartesian3.add(currentPos, Cesium.Cartesian3.multiplyByScalar(radialDir, 2000.0, scratchOcclusionPos), scratchOcclusionPos);
            const isOccluded = !occluder.isPointVisible(checkPos);

            if (node.billboard) node.billboard.show = !isOccluded;
            if (node.point) node.point.show = !isOccluded;
        });
        
        return moved;
    }
}
