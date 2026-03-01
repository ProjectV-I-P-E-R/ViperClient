import {Viewer, Cesium3DTileset, Globe, Clock, Entity, PointGraphics} from "resium";
import {
    RequestScheduler,
    CustomShader,
    LightingModel,
    ClockStep, Cartesian3, Color,
} from "cesium";
import "./App.css";
import { useAppConfig } from "@/lib/hooks/useConfig.ts";
import {useState, useMemo, useEffect} from "react";
import { OptionsMenu } from "@/components/viper/OptionMenu.tsx";
import * as Cesium from "cesium";
import {invoke} from "@tauri-apps/api/core";

RequestScheduler.requestsByServer["tile.googleapis.com:443"] = 18;

function App() {
    const config = useAppConfig();
    const [dayNightCycle, setDayNightCycle] = useState(false);

    const [orbitalPoints, setOrbitalPoints] = useState<Cartesian3[]>([]);

    useEffect(() => {
        async function getOrbitals() {
            const jsonString = await invoke<string>("fetch_orbitals", {
                minLat: -90.0,
                maxLat: 90.0,
                minLon: -180.0,
                maxLon: 180.0,
                zoomLevel: 1,
            });

            const payload = JSON.parse(jsonString);

            const positions = payload.objects.map((obj: any) =>
                Cartesian3.fromDegrees(obj.longitude, obj.latitude, obj.altitude)
            );

            setOrbitalPoints(positions);
        }

        getOrbitals();
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
                full
                baseLayerPicker={false}
                timeline={false}
                animation={false}
                fullscreenButton={false}
                geocoder={Cesium.IonGeocodeProviderType.GOOGLE}
                homeButton={false}
                infoBox={false}
                sceneModePicker={false}
                selectionIndicator={false}
                navigationHelpButton={false}
                shadows={true}
            >
                {orbitalPoints.map((pos, index) => (
                    <Entity key={index} position={pos}>
                        <PointGraphics pixelSize={6} color={Color.YELLOW} />
                    </Entity>
                ))}

                <Clock
                    shouldAnimate={true}
                    multiplier={1}
                    clockStep={ClockStep.SYSTEM_CLOCK}
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
                        ],
                    },
                ]}
            />
        </>
    );
}

export default App;