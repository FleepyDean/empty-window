import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        slateGlow: "#8aa3ff"
      },
      boxShadow: {
        glow: "0 0 30px rgba(138, 163, 255, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
