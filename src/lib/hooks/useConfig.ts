import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {LoadedConfig} from "@/lib/models/appConfig.ts";

export function useAppConfig() {
    const [config, setConfig] = useState<LoadedConfig | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        let mounted = true;
        async function fetchConfig() {
            try {
                setLoading(true);
                const data = await invoke<LoadedConfig>('get_config');
                if (mounted) {
                    setConfig(data);
                    setError(null);
                }
            } catch (err) {
                console.error('Failed to load application config from Tauri:', err);
                if (mounted) {
                    setError(err instanceof Error ? err.message : String(err));
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        }
        fetchConfig();
        return () => {
            mounted = false;
        };
    }, []);
    return { config, loading, error };
}