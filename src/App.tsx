import {Viewer, Cesium3DTileset, Globe, Clock} from "resium";
import {
    RequestScheduler,
    CustomShader,
    LightingModel,
    ClockStep, Cartesian3, Color, ConstantPositionProperty, JulianDate
} from "cesium";
import "./App.css";
import { useAppConfig } from "@/lib/hooks/useConfig.ts";
import {useState, useMemo, useEffect, useRef} from "react";
import { OptionsMenu } from "@/components/viper/OptionMenu.tsx";
import * as Cesium from "cesium";
import { WsClient, ServerMessage } from "@/lib/wsClient.ts";
import * as satellite from "satellite.js";

RequestScheduler.requestsByServer["tile.googleapis.com:443"] = 18;

// Extracts the math model and calculates current position
function processOrbitalData(obj: any, jsDate: Date): { pos: Cartesian3 | null, satrec: satellite.SatRec | null } {
    if (obj.entity_type === "Orbital" && obj.tags?.orbital_gp) {
        try {
            const omm = JSON.parse(obj.tags.orbital_gp);
            
            // Format line 1
            const noradId = (omm.NORAD_CAT_ID || 0).toString().padStart(5, '0');
            const classification = omm.CLASSIFICATION_TYPE || 'U';
            
            let intlDesignator = '        ';
            if (omm.OBJECT_ID) {
                const parts = omm.OBJECT_ID.split('-');
                if (parts.length === 2) {
                    const yy = parts[0].substring(2, 4);
                    const nnnppp = parts[1];
                    intlDesignator = (yy + nnnppp).padEnd(8, ' ').substring(0, 8);
                } else {
                    intlDesignator = omm.OBJECT_ID.padEnd(8, ' ').substring(0, 8);
                }
            }
            
            // Format epoch (YYDDD.DDDDDDDD)
            const epochDate = new Date(omm.EPOCH);
            const year = epochDate.getUTCFullYear();
            const yy = year % 100;
            const startOfYear = new Date(Date.UTC(year, 0, 0));
            const diff = epochDate.getTime() - startOfYear.getTime();
            const dayOfYear = (diff / 86400000) + 1;
            const epochStr = yy.toString().padStart(2, '0') + dayOfYear.toFixed(8).padStart(12, '0');
            
            const line1 = `1 ${noradId}${classification} ${intlDesignator} ${epochStr} -.00000000  00000-0  00000-0 0  9999`;
            
            // Format line 2
            const inc = (omm.INCLINATION || 0).toFixed(4).padStart(8, ' ');
            const raan = (omm.RA_OF_ASC_NODE || 0).toFixed(4).padStart(8, ' ');
            const ecc = ((omm.ECCENTRICITY || 0) * 10000000).toFixed(0).padStart(7, '0');
            const argp = (omm.ARG_OF_PERICENTER || 0).toFixed(4).padStart(8, ' ');
            const ma = (omm.MEAN_ANOMALY || 0).toFixed(4).padStart(8, ' ');
            const mm = (omm.MEAN_MOTION || 0).toFixed(8).padStart(11, ' ');
            const rev = (omm.REV_AT_EPOCH || 0).toString().padStart(5, ' ');
            
            const line2 = `2 ${noradId} ${inc} ${raan} ${ecc} ${argp} ${ma} ${mm}${rev}9`;
            
            const satrec = satellite.twoline2satrec(line1, line2);
            
            // Propagate for the requested time
            const positionAndVelocity = satellite.propagate(satrec, jsDate);
            if (!positionAndVelocity || !positionAndVelocity.position) {
                return { pos: null, satrec };
            }

            const positionGd = satellite.eciToGeodetic(positionAndVelocity.position as satellite.EciVec3<number>, satellite.gstime(jsDate));
            
            const longitude = satellite.degreesLong(positionGd.longitude);
            const latitude = satellite.degreesLat(positionGd.latitude);
            const height = positionGd.height * 1000; // km to meters
            
            if (Number.isNaN(longitude) || Number.isNaN(latitude) || Number.isNaN(height)) {
                return { pos: null, satrec };
            }
            
            return {
                pos: Cartesian3.fromDegrees(longitude, latitude, height),
                satrec
            };
        } catch (e) {
            return { pos: null, satrec: null };
        }
    }
    
    // Fallback to static lat/lon if not orbital or if it failed
    const alt = obj.altitude !== undefined ? obj.altitude : 0;
    return {
        pos: Cartesian3.fromDegrees(obj.lon || 0, obj.lat || 0, alt),
        satrec: null
    };
}

// Determines the color based on the entity type
function getColorForEntity(entityType: string, callsign?: string): Color {
    switch (entityType) {
        case "Aircraft": return Color.AQUA;
        case "Vessel": return Color.ORANGE;
        case "SignalNode": return Color.MAGENTA;
        case "Orbital":
            if (!callsign) return Color.YELLOW;
            const upperCallsign = callsign.toUpperCase();
            if (upperCallsign.includes("ISS") || upperCallsign.includes("STATION")) {
                return Color.LIME; // Station
            }
            if (upperCallsign.includes("DEB")) {
                return Color.DARKGRAY; // Debris
            }
            if (upperCallsign.includes("STARLINK")) {
                return Color.CYAN; // Starlink
            }
            if (upperCallsign.includes("ONEWEB")) {
                return Color.HOTPINK; // OneWeb
            }
            if (upperCallsign.includes("IRIDIUM")) {
                return Color.CORAL; // Iridium
            }
            if (upperCallsign.includes("NAVSTAR") || upperCallsign.includes("GLONASS") || 
                upperCallsign.includes("GALILEO") || upperCallsign.includes("BEIDOU")) {
                return Color.MEDIUMPURPLE; // GNSS/Navigation
            }
            return Color.YELLOW; // Default satellite
        default: return Color.WHITE;
    }
}

// Determines if an entity gets a 3D model
function getModelURIForEntity(entityType: string, subtype: string): string | null {
    if (entityType === "Aircraft") {
        return "/models/aircraft.glb";
    }
    if (entityType === "Vessel") {
        return "/models/vessel.glb";
    }
    if (entityType === "Orbital") {
        if (subtype === "Station") {
            return "/models/iss.glb";
        }
        // DELETED: standard satellite models to save memory
        return null; 
    }
    return null;
}

// Helper to pre-compute an entire orbit polyline (one revolution)
function computeOrbitPath(satrec: satellite.SatRec, jsDate: Date): Cartesian3[] {
    const positions: Cartesian3[] = [];
    const meanMotion = satrec.no * (1440 / (2 * Math.PI)); // revs per day
    if (meanMotion <= 0) return positions;
    
    // Time for one full revolution in minutes
    const periodMinutes = 1440 / meanMotion;
    
    // Sample the orbit in ~2 minute intervals
    const segments = Math.max(Math.ceil(periodMinutes / 2), 60);
    const timeStepMs = (periodMinutes * 60000) / segments;
    
    const startTime = jsDate.getTime();
    
    for (let i = 0; i <= segments; i++) {
        const t = new Date(startTime + (i * timeStepMs));
        const posVel = satellite.propagate(satrec, t);
        if (posVel && posVel.position) {
            const posGd = satellite.eciToGeodetic(posVel.position as satellite.EciVec3<number>, satellite.gstime(t));
            const lon = satellite.degreesLong(posGd.longitude);
            const lat = satellite.degreesLat(posGd.latitude);
            const height = posGd.height * 1000;
            if (!Number.isNaN(lon) && !Number.isNaN(lat) && !Number.isNaN(height)) {
                positions.push(Cartesian3.fromDegrees(lon, lat, height));
            }
        }
    }
    
    return positions;
}

// Global mutable state purely for the WebSocket event loop (since it bypasses React renders)
const activeFilters = {
    aircraft: true,
    vessels: true,
    orbitals: true,
    starlink: false,
    oneweb: false,
    iridium: false,
    navigation: false,
    stations: true,
    debris: false,
    signalNodes: true,
    showOrbitPaths: false,
};

function App() {
    const config = useAppConfig();
    const [dayNightCycle, setDayNightCycle] = useState(false);
    const viewerRef = useRef<any>(null);

    // Filter toggles mapped to React state for the UI
    const [showAircraft, setShowAircraft] = useState(true);
    const [showVessels, setShowVessels] = useState(true);
    const [showOrbitals, setShowOrbitals] = useState(true);
    const [showStarlink, setShowStarlink] = useState(false); // Default off to declutter
    const [showOneWeb, setShowOneWeb] = useState(false);
    const [showIridium, setShowIridium] = useState(false);
    const [showNavigation, setShowNavigation] = useState(false);
    const [showStations, setShowStations] = useState(true);
    const [showDebris, setShowDebris] = useState(false); // Default debris off since it's massive
    const [showSignalNodes, setShowSignalNodes] = useState(true);
    const [showOrbitPaths, setShowOrbitPaths] = useState(false); // Default off (heavy compute)

    // Sync React state down to the mutable object that the WebSocket callback reads
    useEffect(() => {
        activeFilters.aircraft = showAircraft;
        activeFilters.vessels = showVessels;
        activeFilters.orbitals = showOrbitals;
        activeFilters.starlink = showStarlink;
        activeFilters.oneweb = showOneWeb;
        activeFilters.iridium = showIridium;
        activeFilters.navigation = showNavigation;
        activeFilters.stations = showStations;
        activeFilters.debris = showDebris;
        activeFilters.signalNodes = showSignalNodes;
        
        activeFilters.showOrbitPaths = showOrbitPaths;

        // Force a re-evaluation of all current entities to hide/show them
        const viewer = viewerRef.current?.cesiumElement;
        if (viewer) {
            viewer.entities.suspendEvents();
            
            const jsNow = JulianDate.toDate(viewer.clock.currentTime);

            for (const entity of viewer.entities.values) {
                // We use a custom property to store its type for quick filtering
                const type = entity.properties?.entityType?.getValue() || "Unknown";
                const subtype = entity.properties?.subType?.getValue() || "Unknown";

                let visible = true;
                if (type === "Aircraft") visible = activeFilters.aircraft;
                else if (type === "Vessel") visible = activeFilters.vessels;
                else if (type === "SignalNode") visible = activeFilters.signalNodes;
                else if (type === "Orbital") {
                    if (subtype === "Station") visible = activeFilters.stations;
                    else if (subtype === "Debris") visible = activeFilters.debris;
                    else if (subtype === "Starlink") visible = activeFilters.starlink;
                    else if (subtype === "OneWeb") visible = activeFilters.oneweb;
                    else if (subtype === "Iridium") visible = activeFilters.iridium;
                    else if (subtype === "Navigation") visible = activeFilters.navigation;
                    else visible = activeFilters.orbitals;
                }
                
                entity.show = visible;

                // Handle orbit paths if this entity is a satellite
                if (type === "Orbital" && entity.properties?.satrec) {
                    if (visible && activeFilters.showOrbitPaths) {
                        // Generate the path if it doesn't exist yet
                        if (!entity.polyline) {
                            const satrec = entity.properties.satrec.getValue();
                            const pathPositions = computeOrbitPath(satrec, jsNow);
                            if (pathPositions.length > 0) {
                                entity.polyline = new Cesium.PolylineGraphics({
                                    positions: pathPositions,
                                    width: 1,
                                    material: new Cesium.ColorMaterialProperty(
                                        getColorForEntity("Orbital", entity.description?.getValue() as string).withAlpha(0.3)
                                    ),
                                });
                            }
                        }
                    } else if (entity.polyline) {
                        // Destroy path to free memory when hidden/toggled off
                        entity.polyline = undefined as any;
                    }
                }
            }
            viewer.entities.resumeEvents();
            viewer.scene.requestRender();
        }
    }, [showAircraft, showVessels, showOrbitals, showStarlink, showOneWeb, showIridium, showNavigation, showStations, showDebris, showSignalNodes, showOrbitPaths]);

    useEffect(() => {
        const wsUrl = `ws://127.0.0.1:50051`; // Adjust this based on actual central server URL
        const wsClient = new WsClient(wsUrl);

        const handleMessage = (msg: ServerMessage) => {
            const viewer = viewerRef.current?.cesiumElement;
            if (!viewer) return;

            viewer.entities.suspendEvents();
            const jsNow = JulianDate.toDate(viewer.clock.currentTime);

            const processObj = (obj: any) => {
                const { pos: initialPos, satrec } = processOrbitalData(obj, jsNow);
                if (!initialPos) return;

                const type = obj.entity_type || "Unknown";
                let subtype = "Standard";
                let visible = true;

                if (type === "Aircraft") visible = activeFilters.aircraft;
                else if (type === "Vessel") visible = activeFilters.vessels;
                else if (type === "SignalNode") visible = activeFilters.signalNodes;
                else if (type === "Orbital") {
                    const callsign = (obj.callsign || "").toUpperCase();
                    
                    if (callsign.includes("ISS") || callsign.includes("STATION")) {
                        subtype = "Station";
                        visible = activeFilters.stations;
                    } else if (callsign.includes("DEB") || (obj.tags?.orbital_gp && obj.tags.orbital_gp.includes("DEB"))) {
                        subtype = "Debris";
                        visible = activeFilters.debris;
                    } else if (callsign.includes("STARLINK")) {
                        subtype = "Starlink";
                        visible = activeFilters.starlink;
                    } else if (callsign.includes("ONEWEB")) {
                        subtype = "OneWeb";
                        visible = activeFilters.oneweb;
                    } else if (callsign.includes("IRIDIUM")) {
                        subtype = "Iridium";
                        visible = activeFilters.iridium;
                    } else if (callsign.includes("NAVSTAR") || callsign.includes("GLONASS") || 
                               callsign.includes("GALILEO") || callsign.includes("BEIDOU")) {
                        subtype = "Navigation";
                        visible = activeFilters.navigation;
                    } else {
                        subtype = "Standard";
                        visible = activeFilters.orbitals;
                    }
                }

                // Dynamic position using CallbackProperty for ultra-smooth & efficient animation
                const position = satrec ? new Cesium.CallbackProperty((time) => {
                    if (!time) return initialPos;
                    const date = JulianDate.toDate(time);
                    const posVel = satellite.propagate(satrec, date);
                    if (posVel && posVel.position) {
                        const posGd = satellite.eciToGeodetic(posVel.position as satellite.EciVec3<number>, satellite.gstime(date));
                        const lon = satellite.degreesLong(posGd.longitude);
                        const lat = satellite.degreesLat(posGd.latitude);
                        const height = posGd.height * 1000;
                        if (!Number.isNaN(lon) && !Number.isNaN(lat) && !Number.isNaN(height)) {
                            return Cartesian3.fromDegrees(lon, lat, height);
                        }
                    }
                    return initialPos; // Fallback
                }, false) : new ConstantPositionProperty(initialPos);

                // Pre-generate polyline if orbit paths are toggled on and it's visible
                let polyline;
                if (type === "Orbital" && visible && activeFilters.showOrbitPaths && satrec) {
                    const pathPositions = computeOrbitPath(satrec, jsNow);
                    if (pathPositions.length > 0) {
                        polyline = {
                            positions: pathPositions,
                            width: 1,
                            material: new Cesium.ColorMaterialProperty(
                                getColorForEntity(type, obj.callsign).withAlpha(0.3)
                            ),
                        };
                    }
                }

                // Check if this entity gets a 3D model
                const modelUri = getModelURIForEntity(type, subtype);
                
                // Point fallback for objects without a model, or to act as a dot when zoomed out
                const point = {
                    pixelSize: subtype === "Station" ? 8 : 4,
                    color: getColorForEntity(type, obj.callsign),
                    outlineColor: Color.BLACK,
                    outlineWidth: 1,
                    // If we have a model, we can still show the point when zoomed out using distance display condition
                    distanceDisplayCondition: modelUri ? new Cesium.DistanceDisplayCondition(1000000.0, Number.MAX_VALUE) : undefined
                };
                
                const model = modelUri ? {
                    uri: modelUri,
                    minimumPixelSize: 64, // Increased so it's easier to see from further away
                    maximumScale: 500,
                    // Hide model when zoomed out to save rendering performance
                    distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 1000000.0)
                } : undefined;

                return {
                    id: obj.id,
                    position,
                    show: visible,
                    point,
                    model,
                    polyline,
                    properties: {
                        entityType: type,
                        subType: subtype,
                        satrec: satrec // Stored so the tick loop can do math on it every frame
                    },
                    description: obj.callsign || obj.id
                };
            };

            if (Array.isArray(msg)) {
                viewer.entities.removeAll();
                for (const obj of msg) {
                    const entityData = processObj(obj);
                    if (entityData) viewer.entities.add(entityData);
                }
            } else if (msg.type === "snapshot" || msg.type === "snapshot_chunk") {
                if (msg.type === "snapshot") viewer.entities.removeAll();
                msg.objects?.forEach((obj: any) => {
                    const entityData = processObj(obj);
                    if (entityData) viewer.entities.add(entityData);
                });
            } else if (msg.type === "delta") {
                msg.removed?.forEach((id: string) => viewer.entities.removeById(id));
                msg.updated?.forEach((obj: any) => {
                    const existing = viewer.entities.getById(obj.id);
                    if (existing) {
                        // Updating existing properties
                        const { pos, satrec } = processOrbitalData(obj, jsNow);
                        if (pos) {
                            if (satrec) {
                                // If it already has a callback, we just need to ensure the satrec is fresh
                                if (existing.properties) {
                                    existing.properties.addProperty("satrec", satrec);
                                }
                            } else {
                                existing.position = new ConstantPositionProperty(pos);
                            }
                        }
                    } else {
                        const entityData = processObj(obj);
                        if (entityData) viewer.entities.add(entityData);
                    }
                });
            }

            viewer.entities.resumeEvents();
            viewer.scene.requestRender();
        };

        const unsubscribe = wsClient.onMessage(handleMessage);
        
        // Wait a tick before connecting to avoid React StrictMode double-invoking
        // and immediately closing the WebSocket on the first pass
        const connectTimeout = setTimeout(() => {
            wsClient.connect();
        }, 10);

        return () => {
            clearTimeout(connectTimeout);
            unsubscribe();
            wsClient.disconnect();
        };
    }, []);

    const nightShader = useMemo(
        () =>
            new CustomShader({
                lightingModel: LightingModel.UNLIT,
                fragmentShaderText: `
                    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
                        vec3 normalizedPos = normalize(fsInput.attributes.positionWC);
                        float sunDot = dot(normalizedPos, normalize(czm_sunDirectionWC));
                        float nightFactor = smoothstep(0.0, -0.1, sunDot);
                        material.diffuse *= mix(1.0, 0.05, nightFactor);
                    }
                `,
            }),
        []
    );

    return (
        <>
            <Viewer
                ref={viewerRef}
                full
                baseLayerPicker={false}
                timeline={true} // Enabled timeline to allow time-traveling through orbits!
                animation={true} // Enabled clock animation widget so user can control time rate
                fullscreenButton={false}
                geocoder={Cesium.IonGeocodeProviderType.GOOGLE}
                homeButton={false}
                infoBox={false}
                sceneModePicker={false}
                selectionIndicator={false}
                navigationHelpButton={false}
                shadows={true}
            >
                <Clock
                    shouldAnimate={true}
                    multiplier={1}
                    clockStep={ClockStep.SYSTEM_CLOCK_MULTIPLIER}
                />
                <Globe
                    show={false}
                    enableLighting={true}
                    dynamicAtmosphereLighting={true}
                    dynamicAtmosphereLightingFromSun={true}
                />
                <Cesium3DTileset
                    url={`https://tile.googleapis.com/v1/3dtiles/root.json?key=${config.config?.api_keys.google_maps}`}
                    customShader={dayNightCycle ? nightShader : undefined}
                />
            </Viewer>

            <OptionsMenu
                items={[
                    {
                        type: "section",
                        id: "filters",
                        label: "FILTERS",
                        items: [
                            {
                                type: "switch",
                                id: "filter-orbitals",
                                label: "SATELLITES (OTHER)",
                                value: showOrbitals,
                                onChange: setShowOrbitals,
                            },
                            {
                                type: "switch",
                                id: "filter-starlink",
                                label: "STARLINK",
                                value: showStarlink,
                                onChange: setShowStarlink,
                            },
                            {
                                type: "switch",
                                id: "filter-oneweb",
                                label: "ONEWEB",
                                value: showOneWeb,
                                onChange: setShowOneWeb,
                            },
                            {
                                type: "switch",
                                id: "filter-iridium",
                                label: "IRIDIUM",
                                value: showIridium,
                                onChange: setShowIridium,
                            },
                            {
                                type: "switch",
                                id: "filter-navigation",
                                label: "GPS / GNSS",
                                value: showNavigation,
                                onChange: setShowNavigation,
                            },
                            {
                                type: "switch",
                                id: "filter-stations",
                                label: "SPACE STATIONS",
                                value: showStations,
                                onChange: setShowStations,
                            },
                            {
                                type: "switch",
                                id: "filter-debris",
                                label: "DEBRIS",
                                value: showDebris,
                                onChange: setShowDebris,
                            },
                            {
                                type: "switch",
                                id: "filter-aircraft",
                                label: "AIRCRAFT",
                                value: showAircraft,
                                onChange: setShowAircraft,
                            },
                            {
                                type: "switch",
                                id: "filter-vessels",
                                label: "VESSELS",
                                value: showVessels,
                                onChange: setShowVessels,
                            },
                            {
                                type: "switch",
                                id: "filter-signals",
                                label: "SIGNAL NODES",
                                value: showSignalNodes,
                                onChange: setShowSignalNodes,
                            }
                        ],
                    },
                    {
                        type: "section",
                        id: "display",
                        label: "DISPLAY",
                        items: [
                            {
                                type: "switch",
                                id: "day-night",
                                label: "DAY/NIGHT CYCLE",
                                value: dayNightCycle,
                                onChange: setDayNightCycle,
                            },
                            {
                                type: "switch",
                                id: "show-orbits",
                                label: "SHOW ORBIT PATHS",
                                value: showOrbitPaths,
                                onChange: setShowOrbitPaths,
                            },
                        ],
                    },
                ]}
            />
        </>
    );
}

export default App;