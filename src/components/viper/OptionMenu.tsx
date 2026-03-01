import { useState, useEffect } from "react";
import useSound from "use-sound";
import { motion, AnimatePresence } from "framer-motion";
import {useScale} from "@/lib/hooks/useScale.ts";

export interface SwitchItem {
    type: "switch";
    id: string;
    label: string;
    description?: string;
    value: boolean;
    onChange: (val: boolean) => void;
}

export interface SectionItem {
    type: "section";
    id: string;
    label: string;
    items: MenuItem[];
}

export type MenuItem = SwitchItem | SectionItem;

interface OptionsMenuProps {
    items: MenuItem[];
}

const A = "#e8d44d";

const s = (base: number, scale: number) => Math.round(base * scale);

function SwitchRow({ item, depth, onSound, scale }: {
    item: SwitchItem;
    depth: number;
    onSound: () => void;
    scale: number;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => { onSound(); item.onChange(!item.value); }}
            whileHover={{ backgroundColor: item.value ? `${A}16` : `${A}09` }}
            whileTap={{ scale: 0.985, backgroundColor: `${A}22` }}
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingLeft: s(10 + depth * 14, scale),
                paddingRight: s(10, scale),
                paddingTop: s(10, scale),
                paddingBottom: s(10, scale),
                borderBottom: `1px solid ${A}0f`,
                borderLeft: item.value ? `${s(2, scale)}px solid ${A}` : `${s(2, scale)}px solid transparent`,
                cursor: "pointer",
                gap: s(16, scale),
                background: item.value ? `${A}0a` : "transparent",
                transition: "background 0.18s, border-color 0.18s",
                boxShadow: item.value ? `inset 0 0 24px ${A}08` : "none",
            }}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: s(3, scale) }}>
                <motion.span
                    animate={{ color: item.value ? A : `${A}66` }}
                    transition={{ duration: 0.18 }}
                    style={{
                        fontSize: s(depth === 0 ? 12 : 11, scale),
                        letterSpacing: "0.07em",
                    }}
                >
                    {item.label}
                </motion.span>
                {item.description && (
                    <span style={{
                        fontSize: s(9, scale),
                        color: item.value ? `${A}66` : `${A}33`,
                        letterSpacing: "0.05em",
                        transition: "color 0.18s",
                    }}>
                        {item.description}
                    </span>
                )}
            </div>

            <motion.div
                animate={{
                    background: item.value ? A : "transparent",
                    boxShadow: item.value ? `0 0 6px ${A}, 0 0 12px ${A}66` : "none",
                    borderColor: item.value ? A : `${A}33`,
                }}
                transition={{ duration: 0.16 }}
                style={{
                    flexShrink: 0,
                    width: s(7, scale),
                    height: s(7, scale),
                    borderRadius: "50%",
                    border: `1px solid`,
                }}
            />
        </motion.div>
    );
}

function Section({ item, depth, onSound, scale }: {
    item: SectionItem;
    depth: number;
    onSound: () => void;
    scale: number;
}) {
    const [open, setOpen] = useState(true);
    const active = countActive(item.items);
    const total = countSwitches(item.items);

    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
            <motion.div
                onClick={() => { setOpen(o => !o); }}
                whileHover={{ backgroundColor: `${A}09` }}
                whileTap={{ backgroundColor: `${A}16`, scale: 0.995 }}
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingLeft: s(10 + depth * 14, scale),
                    paddingRight: s(10, scale),
                    paddingTop: s(7, scale),
                    paddingBottom: s(7, scale),
                    cursor: "pointer",
                    borderBottom: `1px solid ${A}18`,
                    background: depth > 0 ? `${A}04` : "transparent",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: s(7, scale) }}>
                    {depth > 0 && (
                        <div style={{ width: 1, height: s(10, scale), background: `${A}44` }} />
                    )}
                    <span style={{
                        fontSize: s(depth === 0 ? 10 : 9, scale),
                        letterSpacing: "0.18em",
                        color: depth === 0 ? `${A}bb` : `${A}66`,
                        fontWeight: depth === 0 ? "bold" : "normal",
                    }}>
                        {item.label}
                    </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: s(10, scale) }}>
                    <span style={{ fontSize: s(8, scale), color: `${A}44`, letterSpacing: "0.08em" }}>
                        {active}/{total}
                    </span>
                    <motion.div
                        animate={{ rotate: open ? 180 : 0 }}
                        transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
                        style={{ display: "flex" }}
                    >
                        <svg width={s(10, scale)} height={s(6, scale)} viewBox="0 0 10 6" fill="none">
                            <path d="M1 1L5 5L9 1" stroke={`${A}77`} strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </motion.div>
                </div>
            </motion.div>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                        style={{ overflow: "hidden" }}
                    >
                        <MenuItems items={item.items} depth={depth + 1} onSound={onSound} scale={scale} />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function MenuItems({ items, depth, onSound, scale }: {
    items: MenuItem[];
    depth: number;
    onSound: () => void;
    scale: number;
}) {
    return (
        <>
            {items.map(item =>
                item.type === "section"
                    ? <Section key={item.id} item={item} depth={depth} onSound={onSound} scale={scale} />
                    : <SwitchRow key={item.id} item={item} depth={depth} onSound={onSound} scale={scale} />
            )}
        </>
    );
}

function countActive(items: MenuItem[]): number {
    return items.reduce((n, i) => n + (i.type === "switch" ? (i.value ? 1 : 0) : countActive(i.items)), 0);
}
function countSwitches(items: MenuItem[]): number {
    return items.reduce((n, i) => n + (i.type === "switch" ? 1 : countSwitches(i.items)), 0);
}

function LiveClock({ scale }: { scale: number }) {
    const [t, setT] = useState(() => new Date().toISOString().slice(11, 19));
    useEffect(() => {
        const id = setInterval(() => setT(new Date().toISOString().slice(11, 19)), 1000);
        return () => clearInterval(id);
    }, []);
    return <span style={{ fontSize: s(8, scale), color: `${A}33`, letterSpacing: "0.1em" }}>{t}Z</span>;
}

export function OptionsMenu({ items }: OptionsMenuProps) {
    const [open, setOpen] = useState(false);
    const [playSound] = useSound("/sounds/click.mp3", { volume: 1 });
    const play = () => playSound();
    const scale = useScale();

    const active = countActive(items);
    const total = countSwitches(items);
    const borderL = s(3, scale);

    return (
        <div style={{
            position: "fixed",
            top: s(16, scale),
            left: s(16, scale),
            zIndex: 100,
            fontFamily: "'Courier New', monospace",
            color: A,
            userSelect: "none",
            width: s(272, scale),
        }}>
            <motion.div
                onClick={() => { setOpen(o => !o); }}
                whileHover={{ borderColor: `${A}aa` }}
                whileTap={{ scale: 0.985 }}
                style={{
                    background: "rgba(10,10,8,0.94)",
                    border: `1px solid ${A}55`,
                    borderLeft: `${borderL}px solid ${A}`,
                    paddingLeft: s(10, scale),
                    paddingRight: s(10, scale),
                    paddingTop: s(9, scale),
                    paddingBottom: s(9, scale),
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backdropFilter: "blur(8px)",
                    boxShadow: "0 0 20px rgba(0,0,0,0.5)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: s(8, scale) }}>
                    <motion.div
                        animate={{ opacity: [1, 0.2, 1] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                        style={{
                            width: s(6, scale),
                            height: s(6, scale),
                            borderRadius: "50%",
                            background: A,
                            boxShadow: `0 0 6px ${A}`,
                            flexShrink: 0,
                        }}
                    />
                    <span style={{ fontSize: s(11, scale), letterSpacing: "0.2em", fontWeight: "bold" }}>
                        SYS CONFIG
                    </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: s(10, scale) }}>
                    <span style={{ fontSize: s(8, scale), color: `${A}55`, letterSpacing: "0.1em" }}>
                        {active}/{total} ACT
                    </span>
                    <motion.div
                        animate={{ rotate: open ? 180 : 0 }}
                        transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
                        style={{ display: "flex" }}
                    >
                        <svg width={s(10, scale)} height={s(6, scale)} viewBox="0 0 10 6" fill="none">
                            <path d="M1 1L5 5L9 1" stroke={`${A}88`} strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </motion.div>
                </div>
            </motion.div>

            <AnimatePresence>
                {open && (
                    <motion.div
                        key="panel"
                        initial={{ opacity: 0, scaleY: 0.94, y: -8 }}
                        animate={{ opacity: 1, scaleY: 1, y: 0 }}
                        exit={{ opacity: 0, scaleY: 0.94, y: -8 }}
                        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                            background: "rgba(8,8,6,0.96)",
                            border: `1px solid ${A}33`,
                            borderTop: "none",
                            borderLeft: `${borderL}px solid ${A}44`,
                            backdropFilter: "blur(12px)",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                            transformOrigin: "top center",
                            overflow: "hidden",
                        }}
                    >
                        <MenuItems items={items} depth={0} onSound={play} scale={scale} />

                        <div style={{
                            paddingLeft: s(10, scale),
                            paddingRight: s(10, scale),
                            paddingTop: s(5, scale),
                            paddingBottom: s(5, scale),
                            borderTop: `1px solid ${A}18`,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}>
                            <span style={{ fontSize: s(8, scale), color: `${A}33`, letterSpacing: "0.1em" }}>
                                VIPER/SYS/V1
                            </span>
                            <LiveClock scale={scale} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}