import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./types/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "bg-base": "#0D1117",
        "bg-surface": "#161B22",
        "bg-elevated": "#1C2128",
        "bg-sidebar": "#0D1117",
        "border-subtle": "#21262D",
        "border-active": "#30363D",
        "accent-primary": "#7C3AED",
        "accent-glow": "#6D28D9",
        "green-active": "#10B981",
        "amber-writing": "#F59E0B",
        "blue-research": "#3B82F6",
        "red-error": "#EF4444",
        "text-primary": "#F0F6FC",
        "text-secondary": "#8B949E",
        "text-mono": "#C9D1D9",
        "text-accent": "#A78BFA",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "JetBrains Mono", "monospace"],
      },
      borderRadius: {
        card: "8px",
        input: "6px",
        badge: "4px",
      },
      boxShadow: {
        "focus-ring": "0 0 0 2px #0D1117, 0 0 0 4px #7C3AED",
      },
    },
  },
  plugins: [],
};

export default config;
