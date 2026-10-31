import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  bundle: true,
  noExternal: ["@office/shared"],
  clean: true,
  sourcemap: false,
  dts: false
});
