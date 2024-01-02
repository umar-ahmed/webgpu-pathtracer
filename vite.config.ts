import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";

export default defineConfig({
  build: { target: "es2022" },
  plugins: [rawPlugin({ fileRegex: /\.wgsl$/ })],
});
