import { useEffect, useState } from "react";
import { selectionStore } from "@/engine/SyncEngine";
import { centralStateStore } from "@/engine/StateStore";
import { TrackedObject } from "@/engine/types";

export function Reticle() {
    const [targetId, setTargetId] = useState<string | null>(selectionStore.targetId);
    const [targetData, setTargetData] = useState<TrackedObject | null>(null);

    useEffect(() => {
        const unsub = selectionStore.subscribe((id) => {
            setTargetId(id);
            if (id) {
                setTargetData(centralStateStore.get(id) || null);
            } else {
                setTargetData(null);
            }
        });
        return () => { unsub(); };
    }, []);

    useEffect(() => {
        if (!targetId) return;
        const interval = setInterval(() => {
            setTargetData(centralStateStore.get(targetId) || null);
        }, 1000);
        return () => clearInterval(interval);
    }, [targetId]);

    if (!targetId) return null;

    return (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
            <div className="relative flex h-64 w-64 items-center justify-center">
                <div className="absolute top-0 left-0 h-8 w-8 border-t-2 border-l-2 border-green-500 opacity-80" />
                <div className="absolute top-0 right-0 h-8 w-8 border-t-2 border-r-2 border-green-500 opacity-80" />
                <div className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-green-500 opacity-80" />
                <div className="absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-green-500 opacity-80" />

                <div className="absolute h-full w-[1px] bg-green-500/30" />
                <div className="absolute h-[1px] w-full bg-green-500/30" />

                {targetData && (
                    <div className="absolute bottom-[-80px] left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/50 p-2 font-mono text-xs text-green-400 backdrop-blur-sm">
                        <div className="font-bold text-green-300">{targetData.callsign || targetData.id}</div>
                        <div>TYPE: {targetData.entity_type.toUpperCase()}</div>
                        <div>ALT: {Math.round(targetData.altitude)} {targetData.entity_type === "Aircraft" ? "FT" : "M"}</div>
                        <div>SPD: {Math.round(targetData.velocity)} KTS</div>
                        <div>HDG: {Math.round(targetData.heading)}°</div>
                    </div>
                )}
            </div>
            
            <div className="absolute top-24 right-24 font-mono text-sm text-green-500/80">
                [TRACKING SYSTEM ACTIVE]
                <br />
                DBL-CLICK BG TO DISENGAGE
            </div>
        </div>
    );
}
