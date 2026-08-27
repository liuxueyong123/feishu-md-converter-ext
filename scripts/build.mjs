import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(projectRoot, "dist");

if (!outputDirectory.startsWith(`${projectRoot}/`)) {
  throw new Error("Refusing to clean a build directory outside the project.");
}

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });

await Promise.all([
  build({
    bundle: true,
    entryPoints: [join(projectRoot, "src/background.ts")],
    format: "iife",
    outfile: join(outputDirectory, "background.js"),
    platform: "browser",
    sourcemap: true,
    target: "chrome114",
  }),
  build({
    bundle: true,
    entryPoints: [join(projectRoot, "src/content.ts")],
    format: "iife",
    outfile: join(outputDirectory, "content.js"),
    platform: "browser",
    sourcemap: true,
    target: "chrome114",
  }),
  build({
    bundle: true,
    entryPoints: [join(projectRoot, "src/main-world.ts")],
    format: "iife",
    outfile: join(outputDirectory, "main-world.js"),
    platform: "browser",
    sourcemap: true,
    target: "chrome114",
  }),
]);

await cp(join(projectRoot, "manifest.json"), join(outputDirectory, "manifest.json"));
