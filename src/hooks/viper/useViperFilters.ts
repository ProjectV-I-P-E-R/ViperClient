import { useState, useRef, useEffect } from "react";

export interface ViperFilters {
    aircraft: boolean;
    vessels: boolean;
    orbitals: boolean;
    starlink: boolean;
    oneweb: boolean;
    iridium: boolean;
    navigation: boolean;
    stations: boolean;
    debris: boolean;
    signalNodes: boolean;
    thermalAnomalies: boolean;
    gpsInterference: boolean;
    showOrbitPaths: boolean;
}

export const DEFAULT_FILTERS: ViperFilters = {
    aircraft: false,
    vessels: false,
    orbitals: false,
    starlink: false,
    oneweb: false,
    iridium: false,
    navigation: false,
    stations: false,
    debris: false,
    signalNodes: false,
    thermalAnomalies: false,
    gpsInterference: false,
    showOrbitPaths: false,
};

export function useViperFilters() {
    const [filters, setFilters] = useState<ViperFilters>(DEFAULT_FILTERS);
    
    const filtersRef = useRef<ViperFilters>(DEFAULT_FILTERS);

    const updateFilter = (key: keyof ViperFilters, value: boolean) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);

    return {
        filters,
        filtersRef,
        updateFilter,
    };
}
