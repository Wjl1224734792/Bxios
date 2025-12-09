import { build } from "bun";
import { rm } from "fs/promises";

console.log("Cleaning dist...");
await rm("./dist", { recursive: true, force: true });

console.log("Building JS...");
await build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  sourcemap: "external",
  minify: true,
});

console.log("Building CLI...");
await build({
  entrypoints: ["./src/bin/bunxios.ts"],
  outdir: "./dist/bin",
  target: "bun",
  format: "esm",
  sourcemap: "external",
  minify: true,
});

console.log("Generating types...");
const proc = Bun.spawn(["bun", "tsc", "-p", "tsconfig.build.json"], {
    stdout: "inherit",
    stderr: "inherit"
});

const exitCode = await proc.exited;

if (exitCode !== 0) {
    console.error("Type generation failed");
    process.exit(exitCode);
}

console.log("Build complete");

