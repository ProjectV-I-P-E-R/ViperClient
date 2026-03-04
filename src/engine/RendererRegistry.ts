import * as Cesium from "cesium";
import { KnownEntityType, EntityType, TrackedObject } from "./types";
import { getColorForEntity, getModelURIForEntity, categorizeEntity } from "@/lib/viper/entityUtils.ts";

export interface VisualConfig {
    id: string;
    name: string;
    point?: {
        pixelSize: number;
        color: Cesium.Color;
        outlineColor: Cesium.Color;
        outlineWidth: number;
        disableDepthTestDistance?: number;
        distanceDisplayCondition?: Cesium.DistanceDisplayCondition;
    };
    billboard?: {
        image: string;
        color: Cesium.Color;
        width: number;
        height: number;
        rotation?: number;
        alignedAxis?: Cesium.Cartesian3;
        eyeOffset?: Cesium.Cartesian3;
        verticalOrigin?: Cesium.VerticalOrigin;
        disableDepthTestDistance?: number;
        distanceDisplayCondition?: Cesium.DistanceDisplayCondition;
    };
    model?: {
        uri: string;
        minimumPixelSize: number;
        maximumScale: number;
        distanceDisplayCondition?: Cesium.DistanceDisplayCondition;
    };
}

export type VisualConfigurationFunction = (obj: TrackedObject) => VisualConfig;

export class RendererRegistry {
    private registry: Map<string, VisualConfigurationFunction> = new Map();

    public register(type: EntityType, fn: VisualConfigurationFunction) {
        this.registry.set(type.toString(), fn);
    }

    public get(type: EntityType): VisualConfigurationFunction | undefined {
        return this.registry.get(type.toString());
    }
}

export const rendererRegistry = new RendererRegistry();

const iconCache: Record<string, HTMLImageElement> = {};
const iconUrls = {
    Aircraft: "/icons/plane.svg",
    Orbital: "/icons/satellite.svg",
    Vessel: "/icons/ship.svg",
    SignalNode: "/icons/antenna.svg",
    HeatSpot: "/icons/fire.svg"
};

Object.entries(iconUrls).forEach(([key, url]) => {
    const img = new Image();
    img.src = url;
    iconCache[key] = img;
});

const genericPointRenderer: VisualConfigurationFunction = (obj) => {
    const { type, subtype } = categorizeEntity(obj);
    const color = getColorForEntity(type, obj.callsign || undefined);
    const modelUri = getModelURIForEntity(type, subtype);

    let iconUrl: string | undefined = undefined;
    if (type === "Aircraft") iconUrl = "/icons/plane.svg";
    else if (type === "Orbital") iconUrl = "/icons/satellite.svg";
    else if (type === "Vessel") iconUrl = "/icons/ship.svg";
    else if (type === "SignalNode") iconUrl = "/icons/antenna.svg";
    else if (type === "HeatSpot") iconUrl = "/icons/fire.svg";

    const isHeatSpot = type === "HeatSpot";
    let heatScale = 1.0;
    if (isHeatSpot && obj.tags?.bright_ti4) {
        const brightness = Number(obj.tags.bright_ti4);
        heatScale = Math.max(1.0, Math.min(2.5, (brightness - 300) / 50 + 1.0));
    }

    return {
        id: obj.id,
        name: obj.callsign || obj.id,
        point: iconUrl ? undefined : {
            pixelSize: subtype === "Station" ? 8 : 4,
            color: color,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            distanceDisplayCondition: modelUri ? new Cesium.DistanceDisplayCondition(2000000.0, Number.MAX_VALUE) : undefined
        },
        billboard: iconUrl ? {
            image: iconUrl,
            color: isHeatSpot ? Cesium.Color.WHITE : color,
            width: (isHeatSpot ? 32 : 24) * heatScale,
            height: (isHeatSpot ? 32 : 24) * heatScale,
            alignedAxis: (!isHeatSpot && obj.heading !== undefined && (type === "Aircraft" || type === "Vessel")) ? Cesium.Cartesian3.UNIT_Z : undefined,
            eyeOffset: new Cesium.Cartesian3(0, 0, -1000.0),
            verticalOrigin: (type === "Aircraft" || type === "Vessel") ? Cesium.VerticalOrigin.BOTTOM : Cesium.VerticalOrigin.CENTER,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 100000000.0)
        } : undefined,
        model: modelUri ? {
            uri: modelUri,
            minimumPixelSize: 64,
            maximumScale: 500,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 500000.0)
        } : undefined,
    };
};

const orbitalRenderer: VisualConfigurationFunction = (obj) => {
    return genericPointRenderer(obj);
};

rendererRegistry.register(KnownEntityType.Aircraft, genericPointRenderer);
rendererRegistry.register(KnownEntityType.Orbital, orbitalRenderer);
rendererRegistry.register(KnownEntityType.Vessel, genericPointRenderer);
rendererRegistry.register(KnownEntityType.SignalNode, genericPointRenderer);
rendererRegistry.register(KnownEntityType.Camera, genericPointRenderer);
rendererRegistry.register(KnownEntityType.FieldAgent, genericPointRenderer);
rendererRegistry.register(KnownEntityType.Unknown, genericPointRenderer);
rendererRegistry.register(KnownEntityType.HeatSpot, genericPointRenderer);
