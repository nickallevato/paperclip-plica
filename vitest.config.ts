import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // The queue's age buckets are calendar days, cut at local midnight, so a
    // suite run in another timezone would file the fixtures under different
    // chips. Pinned rather than worked around, because the buckets are
    // supposed to be local — the test just needs to agree on which local.
    env: { TZ: "UTC" },
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
