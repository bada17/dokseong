import { sites } from "@openai/sites-vite-plugin";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";

const PLACEHOLDER_DATABASE_ID = "00000000-0000-4000-8000-000000000000";
const { d1, r2 } = hostingConfig;

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    plugins: [
      sites(),
      cloudflare({
        configPath: "./wrangler.sites.toml",
        config: {
          d1_databases: d1
            ? [
                {
                  binding: d1,
                  database_name: "site-creator-d1",
                  database_id: PLACEHOLDER_DATABASE_ID,
                },
              ]
            : [],
          r2_buckets: r2
            ? [
                {
                  binding: r2,
                  bucket_name: "site-creator-r2",
                },
              ]
            : [],
        },
      }),
    ],
  };
});
