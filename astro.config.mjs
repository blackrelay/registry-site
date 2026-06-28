import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://registry.blackrelay.network",
  output: "static",
  devToolbar: {
    enabled: false,
  },
});
