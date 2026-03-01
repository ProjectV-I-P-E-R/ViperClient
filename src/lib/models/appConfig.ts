import { z } from "zod";

const AppConfig = z.object({ backend_url: z.string() });
const ApiConfig = z.object({ google_maps: z.string() });
const LoadedConfig = z.object({
    build_version: z.string(),
    api_keys: ApiConfig,
    app: AppConfig,
});

export type AppConfig = z.infer<typeof AppConfig>;
export type ApiConfig = z.infer<typeof ApiConfig>;
export type LoadedConfig = z.infer<typeof LoadedConfig>;