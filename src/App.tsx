import { Viewer, Cesium3DTileset, Globe, Clock } from "resium";
import { RequestScheduler, CustomShader, LightingModel, ClockStep } from "cesium";
import * as Cesium from "cesium";
import { useState, useMemo, useRef } from "react";

import "./App.css";
import { useAppConfig } from "@/lib/hooks/useConfig.ts";
import { OptionsMenu } from "@/components/viper/OptionMenu.tsx";
import { useViperFilters } from "@/hooks/viper/useViperFilters.ts";
import { useViperEntities } from "@/hooks/viper/useViperEntities.ts";
import { Reticle } from "@/components/viper/Reticle.tsx";

RequestScheduler.requestsByServer["tile.googleapis.com:443"] = 18;

function App() {
    const config = useAppConfig();
    const viewerRef = useRef<any>(null);
    const [dayNightCycle, setDayNightCycle] = useState(false);
    
    const { filters, updateFilter } = useViperFilters();
    const { interferenceLoading } = useViperEntities({ viewerRef, filters });

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
                timeline={true}
                animation={true}
                fullscreenButton={false}
                geocoder={Cesium.IonGeocodeProviderType.GOOGLE}
                homeButton={false}
                infoBox={false}
                sceneModePicker={false}
                selectionIndicator={false}
                navigationHelpButton={false}
                shadows={true}
            >
                <Clock shouldAnimate={true} multiplier={1} clockStep={ClockStep.SYSTEM_CLOCK_MULTIPLIER} />
                <Globe show={false} enableLighting={true} dynamicAtmosphereLighting={true} dynamicAtmosphereLightingFromSun={true} />
                <Cesium3DTileset
                    url={`https://tile.googleapis.com/v1/3dtiles/root.json?key=${config.config?.api_keys.google_maps}`}
                    customShader={dayNightCycle ? nightShader : undefined}
                />
            </Viewer>

            <Reticle />

            <OptionsMenu>
                <OptionsMenu.Section label="FILTERS">
                    <OptionsMenu.Switch label="SATELLITES (OTHER)" value={filters.orbitals} onChange={(v) => updateFilter("orbitals", v)} />
                    <OptionsMenu.Switch label="STARLINK" value={filters.starlink} onChange={(v) => updateFilter("starlink", v)} />
                    <OptionsMenu.Switch label="ONEWEB" value={filters.oneweb} onChange={(v) => updateFilter("oneweb", v)} />
                    <OptionsMenu.Switch label="IRIDIUM" value={filters.iridium} onChange={(v) => updateFilter("iridium", v)} />
                    <OptionsMenu.Switch label="GPS / GNSS" value={filters.navigation} onChange={(v) => updateFilter("navigation", v)} />
                    <OptionsMenu.Switch label="SPACE STATIONS" value={filters.stations} onChange={(v) => updateFilter("stations", v)} />
                    <OptionsMenu.Switch label="DEBRIS" value={filters.debris} onChange={(v) => updateFilter("debris", v)} />
                    <OptionsMenu.Switch label="AIRCRAFT" value={filters.aircraft} onChange={(v) => updateFilter("aircraft", v)} />
                    <OptionsMenu.Switch label="VESSELS" value={filters.vessels} onChange={(v) => updateFilter("vessels", v)} />
                    <OptionsMenu.Switch label="SIGNAL NODES" value={filters.signalNodes} onChange={(v) => updateFilter("signalNodes", v)} />
                    <OptionsMenu.Switch label="THERMAL ANOMALIES" value={filters.thermalAnomalies} onChange={(v) => updateFilter("thermalAnomalies", v)} />
                    <OptionsMenu.Switch 
                        label={interferenceLoading ? "GPS INTERFERENCE (CALC...)" : "GPS INTERFERENCE"} 
                        value={filters.gpsInterference} 
                        onChange={(v) => updateFilter("gpsInterference", v)} 
                    />
                </OptionsMenu.Section>

                <OptionsMenu.Section label="DISPLAY">
                    <OptionsMenu.Switch label="DAY/NIGHT CYCLE" value={dayNightCycle} onChange={setDayNightCycle} />
                    <OptionsMenu.Switch label="SHOW ORBIT PATHS" value={filters.showOrbitPaths} onChange={(v) => updateFilter("showOrbitPaths", v)} />
                </OptionsMenu.Section>
            </OptionsMenu>
        </>
    );
}

export default App;
