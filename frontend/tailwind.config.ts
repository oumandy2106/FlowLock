import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cupertino dark system colors
        "apple-bg": "#000000",
        "apple-surface": "#1c1c1e",
        "apple-surface-2": "#2c2c2e",
        "apple-surface-3": "#3a3a3c",
        "apple-separator": "rgba(84,84,88,0.6)",
        "apple-text": "#ffffff",
        "apple-text-secondary": "rgba(235,235,245,0.6)",
        "apple-text-tertiary": "rgba(235,235,245,0.3)",
        // Apple system accent colors (dark mode)
        "apple-blue": "#0a84ff",
        "apple-green": "#30d158",
        "apple-red": "#ff453a",
        "apple-amber": "#ff9f0a",
        "apple-orange": "#ff6a00",
        "apple-purple": "#bf5af2",
        "apple-gray": "#636366",
        // Milestone status colors (from plan)
        "status-draft": "#636366",
        "status-funded": "#0a84ff",
        "status-submitted": "#ff9f0a",
        "status-released": "#30d158",
        "status-refunded": "#ff453a",
        "status-disputed": "#ff6a00",
        "status-cancelled": "#636366",
        "status-mutual": "#bf5af2",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      backdropBlur: {
        xs: "2px",
      },
      borderColor: {
        glass: "rgba(255,255,255,0.08)",
        "glass-hover": "rgba(255,255,255,0.16)",
      },
      backgroundColor: {
        glass: "rgba(255,255,255,0.05)",
        "glass-hover": "rgba(255,255,255,0.08)",
      },
      boxShadow: {
        "apple-sm": "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.5)",
        apple: "0 4px 16px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.4)",
        "apple-lg": "0 16px 40px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.4)",
        "apple-glow": "0 0 20px rgba(10,132,255,0.3)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
