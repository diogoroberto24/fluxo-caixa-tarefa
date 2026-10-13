import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0f2547",
          950: "#0b1c38",
          800: "#162f57",
          700: "#243d66",
        },
        primary: {
          DEFAULT: "#1f5fbf",
          hover: "#194fa0",
          soft: "#e8f0fb",
        },
        success: { DEFAULT: "#12875a", soft: "#e4f5ec", line: "#bfe5d0" },
        danger: { DEFAULT: "#d03a3a", soft: "#fdeceb", line: "#f6c9c8" },
        warning: { DEFAULT: "#c2740c", soft: "#fdf0dc", line: "#f6d9ae" },
        ink: { DEFAULT: "#14264a", muted: "#64748b" },
        line: "#e3e8ef",
        surface: "#f6f8fb",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,37,71,.05), 0 1px 3px rgba(15,37,71,.04)",
      },
    },
  },
  plugins: [],
};

export default config;
