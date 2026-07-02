// Design tokens (per the Key Files Map) — the single source of truth for
// this app's dark, terminal-inspired color palette, fonts, and radii.
// Every component in components/ and app/ styles itself with these
// semantic Tailwind class names (bg-bg-surface, text-text-secondary, etc.)
// rather than raw hex values or Tailwind's default palette.
import type { Config } from "tailwindcss";

const config: Config = {
  // Tailwind only generates CSS for class names it finds by scanning these
  // globs, so any new directory using Tailwind classes must be added here.
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./types/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // Semantic dark-theme palette: bg-* are surface layers (base <
      // surface < elevated), text-* are content hierarchy, and
      // green/amber/blue/red map directly to the SessionStatus states
      // (complete/writing/researching/error) used by StatusBadge.
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
      // Reads font families from CSS custom properties (set elsewhere via
      // globals.css / font loading) rather than hardcoding font names, with
      // the literal family names as a fallback if the variables are unset.
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
