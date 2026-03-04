import { useEffect, useRef } from "react";
import { SyncEngine } from "@/engine/SyncEngine";
import { NetworkLayer } from "@/engine/NetworkLayer";
import { ViperFilters } from "@/hooks/viper/useViperFilters.ts";

interface UseViperEntitiesProps {
    viewerRef: React.RefObject<any>;
    filters: ViperFilters;
}

export function useViperEntities({ viewerRef, filters }: UseViperEntitiesProps) {
    const syncEngineRef = useRef<SyncEngine | null>(null);
    const networkLayerRef = useRef<NetworkLayer | null>(null);

    useEffect(() => {
        // Polling because useRef changes don't trigger re-renders
        const checkReady = setInterval(() => {
            const viewer = viewerRef.current?.cesiumElement;
            if (viewer && !syncEngineRef.current) {
                console.log("[Engine] Cesium Viewer ready. Initializing...");
                
                syncEngineRef.current = new SyncEngine(viewer);
                syncEngineRef.current.start();
                syncEngineRef.current.updateFilters(filters);

                // REST server is on 3000, WS is on 50051
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
            if (networkLayerRef.current) {
                networkLayerRef.current.disconnect();
                networkLayerRef.current = null;
            }
        };
    }, []); // Only run once on mount

    // React to filter changes
    useEffect(() => {
        if (syncEngineRef.current) {
            syncEngineRef.current.updateFilters(filters);
        }
    }, [filters]);
}
