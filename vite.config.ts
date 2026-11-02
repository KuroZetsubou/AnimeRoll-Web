import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, API calls are proxied to the server running on :8080.
export default defineConfig({
  plugins: [react()],
  // JASSUB (libass) runs in a module worker.
  worker: { format: "es" },
  server: {
    proxy: { "/api": "http://localhost:8080", "/media": "http://localhost:8080" },
  },
});
