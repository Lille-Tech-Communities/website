// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import robotsTxt from "astro-robots-txt";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://lille-tech-communities.netlify.app",
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/draft/"),
    }),
    robotsTxt(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
