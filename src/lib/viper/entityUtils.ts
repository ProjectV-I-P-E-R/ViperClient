import { Color } from "cesium";

export function getColorForEntity(entityType: string, callsign?: string): Color {
    switch (entityType) {
        case "Aircraft": return Color.AQUA;
        case "Vessel": return Color.ORANGE;
        case "SignalNode": return Color.MAGENTA;
        case "HeatSpot": return Color.RED;
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

export function getModelURIForEntity(entityType: string, subtype: string): string | null {
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
        return null; 
    }
    return null;
}

export function categorizeEntity(obj: any): { type: string; subtype: string } {
    const type = obj.entity_type || obj.entityType || "Unknown";
    let subtype = "Standard";

    if (type === "Orbital") {
        const callsign = (obj.callsign || "").toUpperCase();
        const tags = obj.tags || {};
        const orbital_gp = tags.orbital_gp || "";
        
        if (callsign.includes("ISS") || callsign.includes("STATION")) {
            subtype = "Station";
        } else if (callsign.includes("DEB") || orbital_gp.includes("DEB")) {
            subtype = "Debris";
        } else if (callsign.includes("STARLINK")) {
            subtype = "Starlink";
        } else if (callsign.includes("ONEWEB")) {
            subtype = "OneWeb";
        } else if (callsign.includes("IRIDIUM")) {
            subtype = "Iridium";
        } else if (callsign.includes("NAVSTAR") || callsign.includes("GLONASS") || 
                   callsign.includes("GALILEO") || callsign.includes("BEIDOU")) {
            subtype = "Navigation";
        }
    }

    return { type, subtype };
}

export function isEntityVisible(type: string, subtype: string, filters: any): boolean {
    if (type === "Aircraft") return filters.aircraft;
    if (type === "Vessel") return filters.vessels;
    if (type === "SignalNode") return filters.signalNodes;
    if (type === "HeatSpot") return filters.thermalAnomalies;
    if (type === "Orbital") {
        if (subtype === "Station") return filters.stations;
        if (subtype === "Debris") return filters.debris;
        if (subtype === "Starlink") return filters.starlink;
        if (subtype === "OneWeb") return filters.oneweb;
        if (subtype === "Iridium") return filters.iridium;
        if (subtype === "Navigation") return filters.navigation;
        return filters.orbitals;
    }
    return true;
}
