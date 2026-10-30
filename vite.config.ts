import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, API calls are proxied to the server running on :8080.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:8080", "/media": "http://localhost:8080" },
  },
});
