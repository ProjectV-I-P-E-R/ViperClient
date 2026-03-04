import * as satellite from "satellite.js";
import { Cartesian3 } from "cesium";

export interface OrbitalResult {
    pos: Cartesian3 | null;
    satrec: satellite.SatRec | null;
}

export function processOrbitalData(obj: any, jsDate: Date): OrbitalResult {
    if (obj.entity_type === "Orbital" && obj.tags?.orbital_gp) {
        try {
            let satrec = (obj as any)._satrec;
            
            if (!satrec) {
                const omm = JSON.parse(obj.tags.orbital_gp);
                
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
                
                const inc = (omm.INCLINATION || 0).toFixed(4).padStart(8, ' ');
                const raan = (omm.RA_OF_ASC_NODE || 0).toFixed(4).padStart(8, ' ');
                const ecc = ((omm.ECCENTRICITY || 0) * 10000000).toFixed(0).padStart(7, '0');
                const argp = (omm.ARG_OF_PERICENTER || 0).toFixed(4).padStart(8, ' ');
                const ma = (omm.MEAN_ANOMALY || 0).toFixed(4).padStart(8, ' ');
                const mm = (omm.MEAN_MOTION || 0).toFixed(8).padStart(11, ' ');
                const rev = (omm.REV_AT_EPOCH || 0).toString().padStart(5, ' ');
                
                const line2 = `2 ${noradId} ${inc} ${raan} ${ecc} ${argp} ${ma} ${mm}${rev}9`;
                
                satrec = satellite.twoline2satrec(line1, line2);
                
                Object.defineProperty(obj, '_satrec', {
                    value: satrec,
                    writable: true,
                    enumerable: false,
                    configurable: true
                });
            }
            
            const positionAndVelocity = satellite.propagate(satrec, jsDate);
            if (!positionAndVelocity || !positionAndVelocity.position) {
                return { pos: null, satrec };
            }

            const positionGd = satellite.eciToGeodetic(positionAndVelocity.position as satellite.EciVec3<number>, satellite.gstime(jsDate));
            
            const longitude = satellite.degreesLong(positionGd.longitude);
            const latitude = satellite.degreesLat(positionGd.latitude);
            const height = positionGd.height * 1000;
            
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
    
    return {
        pos: null,
        satrec: null
    };
}

export function computeOrbitPath(satrec: satellite.SatRec, jsDate: Date): Cartesian3[] {
    const positions: Cartesian3[] = [];
    const meanMotion = satrec.no * (1440 / (2 * Math.PI));
    if (meanMotion <= 0) return positions;
    
    const periodMinutes = 1440 / meanMotion;
    
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
