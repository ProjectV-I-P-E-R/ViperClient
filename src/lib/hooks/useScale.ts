import {useEffect, useState} from "react";

export function useScale() {
    const [scale, setScale] = useState(1);
    useEffect(() => {
        const calc = () => {
            setScale(Math.min(Math.max(window.innerWidth / 1920, 0.65), 1.4));
        };
        calc();
        window.addEventListener("resize", calc);
        return () => window.removeEventListener("resize", calc);
    }, []);
    return scale;
}