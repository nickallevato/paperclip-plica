import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const common = {
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: true,
  logLevel: "info",
};

const builds = [
  {
    ...common,
    entryPoints: ["src/manifest.ts"],
    outfile: "dist/manifest.js",
    platform: "node",
  },
  {
    ...common,
    entryPoints: ["src/worker.ts"],
    outfile: "dist/worker.js",
    platform: "node",
  },
  {
    // The host bridge injects React and the SDK at runtime and rewrites these
    // bare specifiers to blob URLs, so they must stay external. Everything
    // else (react-query, radix, lucide) is bundled into the plugin.
    ...common,
    entryPoints: ["src/ui/index.ts"],
    outfile: "dist/ui/index.js",
    platform: "browser",
    external: ["react", "react-dom", "react/jsx-runtime", "@paperclipai/plugin-sdk/ui"],
    jsx: "automatic",
  },
];

if (watch) {
  const contexts = await Promise.all(builds.map((cfg) => context(cfg)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("watching...");
} else {
  await Promise.all(builds.map((cfg) => build(cfg)));
}
