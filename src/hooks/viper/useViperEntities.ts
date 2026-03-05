import { useEffect, useRef, useState } from "react";
import { SyncEngine } from "@/engine/SyncEngine";
import { NetworkLayer } from "@/engine/NetworkLayer";
import { InterferenceEngine } from "@/engine/InterferenceEngine";
import { ViperFilters } from "@/hooks/viper/useViperFilters.ts";

interface UseViperEntitiesProps {
    viewerRef: React.RefObject<any>;
    filters: ViperFilters;
}

export function useViperEntities({ viewerRef, filters }: UseViperEntitiesProps) {
    const syncEngineRef = useRef<SyncEngine | null>(null);
    const networkLayerRef = useRef<NetworkLayer | null>(null);
    const interferenceEngineRef = useRef<InterferenceEngine | null>(null);
    const [interferenceLoading, setInterferenceLoading] = useState(false);

    useEffect(() => {
        const checkReady = setInterval(() => {
            const viewer = viewerRef.current?.cesiumElement;
            if (viewer && !syncEngineRef.current) {
                console.log("[Engine] Cesium Viewer ready. Initializing...");
                
                syncEngineRef.current = new SyncEngine(viewer);
                syncEngineRef.current.start();
                syncEngineRef.current.updateFilters(filters);

                interferenceEngineRef.current = new InterferenceEngine(viewer);
                interferenceEngineRef.current.onLoadingChange = setInterferenceLoading;
                interferenceEngineRef.current.start();
                interferenceEngineRef.current.setEnabled(filters.gpsInterference);

                const snapshotUrl = `http://${window.location.hostname}:3000/snapshot`;
                const wsUrl = `ws://${window.location.hostname}:50051`;
                
                networkLayerRef.current = new NetworkLayer(snapshotUrl, wsUrl);
                networkLayerRef.current.initialize();
                
                clearInterval(checkReady);
            }
        }, 100);

        return () => {
            clearInterval(checkReady);
            if (syncEngineRef.current) {
                syncEngineRef.current.stop();
                syncEngineRef.current = null;
            }
            if (interferenceEngineRef.current) {
                interferenceEngineRef.current.stop();
                interferenceEngineRef.current = null;
            }
            if (networkLayerRef.current) {
                networkLayerRef.current.disconnect();
                networkLayerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (syncEngineRef.current) {
            syncEngineRef.current.updateFilters(filters);
        }
        if (interferenceEngineRef.current) {
            interferenceEngineRef.current.setEnabled(filters.gpsInterference);
        }
    }, [filters]);

    return {
        interferenceLoading
    };
}
