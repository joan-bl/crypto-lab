import { defineConfig } from "vite";

// base relativa: funciona en GitHub Pages (joan-bl.github.io/crypto-lab/) y abriendo dist/ en local
export default defineConfig({
  base: "./",
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
});
