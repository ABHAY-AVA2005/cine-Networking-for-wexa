// Tailwind v4 is handled by the @tailwindcss/vite plugin in vite.config.ts.
// This file exists to prevent Vite from inheriting the root-level postcss.config.js
// which uses Tailwind v3 (incompatible with this project's @import "tailwindcss" syntax).
export default {
  plugins: {},
};
