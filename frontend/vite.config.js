import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During development, /api requests are proxied to the Flask server on port 5000,
// so the frontend can call "/api/..." without CORS issues.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:5000", changeOrigin: true },
    },
  },
});
