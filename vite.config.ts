import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "./",
  build: { minify: false },
  server: { host: "127.0.0.1" },
});
