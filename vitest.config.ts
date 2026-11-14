import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // runs/ holds the repositories of the apps under review. Their own tests are not ours to run.
    exclude: [...configDefaults.exclude, "runs/**"],
  },
});
