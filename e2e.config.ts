import { existsSync } from "node:fs";
import { google } from "@ai-sdk/google";
import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default {
  tests: ["checks/**/*.e2e.ts"],
  // Kept under the git-ignored runs/ folder; the runner passes its own --output per check.
  output: "runs/.e2e",
  cache: { dir: "runs/.e2e-cache" },
  // The runner stops a check after 120 s; end the test first so it still writes a trace.
  timeout: 110_000,
  targets: [
    {
      name: "phone",
      engine: web({ browser: "webkit", viewport: { width: 390, height: 844 } }),
      app: { url: process.env.APP_URL ?? "" },
    },
  ],
  // The test password reaches the agent only as a name; e2e redacts its value from traces.
  secrets: { testPassword: () => process.env.TEST_PASSWORD ?? "" },
  agents: {
    default: { model: google(process.env.MODEL ?? "gemini-flash-latest") },
  },
} satisfies E2EConfig;
