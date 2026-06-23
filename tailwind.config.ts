import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        tertiary: {
          DEFAULT: "hsl(var(--tertiary))",
          foreground: "hsl(var(--tertiary-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Brand + channel + status colors (build.md §3.1)
        brand: {
          DEFAULT: "#0D9488",
          hover: "#0F766E",
        },
        channel: {
          wa: "#25D366",
          tokopedia: "#03AC0E",
          ig: "#E1306C",
          email: "#6366F1",
          linkedin: "#0A66C2",
          shopee: "#EE4D2D",
          tiktok: "#000000",
        },
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
        info: "#3B82F6",
        // Amber highlight — was an orphaned CSS var; now mapped so bg-highlight /
        // text-highlight actually work (single source for warning accents).
        highlight: {
          DEFAULT: "hsl(var(--highlight))",
          foreground: "hsl(var(--highlight-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        xl: "1.5rem",
        "2xl": "2rem",
        "3xl": "3rem",
      },
      boxShadow: {
        // Soft, warm-neutral depth for light mode
        sm: "0 1px 2px 0 hsl(20 30% 25% / 0.06)",
        DEFAULT: "0 2px 8px -2px hsl(20 35% 25% / 0.08)",
        md: "0 12px 28px -8px hsl(16 45% 30% / 0.12)",
        lg: "0 24px 48px -12px hsl(16 45% 28% / 0.16)",
        xl: "0 32px 64px -18px hsl(16 45% 26% / 0.18)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Autopilot — soft coral aura that breathes around the idle CTA
        "ap-aura": {
          "0%, 100%": {
            boxShadow: "0 0 0 0 hsl(var(--primary) / 0.35), 0 10px 30px -10px hsl(var(--primary) / 0.45)",
          },
          "50%": {
            boxShadow: "0 0 0 14px hsl(var(--primary) / 0), 0 18px 40px -10px hsl(var(--primary) / 0.55)",
          },
        },
        // Autopilot — running step card ring pulse (coral) — follows --primary.
        "ap-ring-pulse": {
          "0%, 100%": {
            boxShadow: "0 0 0 0 hsl(var(--primary) / 0.45)",
            borderColor: "hsl(var(--primary) / 0.55)",
          },
          "50%": {
            boxShadow: "0 0 0 6px hsl(var(--primary) / 0)",
            borderColor: "hsl(var(--primary) / 1)",
          },
        },
        // Autopilot — three thinking dots after "AI menulis..."
        "ap-dot-bounce": {
          "0%, 80%, 100%": { transform: "translateY(0)", opacity: "0.4" },
          "40%": { transform: "translateY(-4px)", opacity: "1" },
        },
        // Autopilot — celebration sparkle radiating outward
        "ap-sparkle": {
          "0%": {
            transform: "translate(-50%, -50%) translate(0, 0) scale(0.4)",
            opacity: "1",
          },
          "100%": {
            transform:
              "translate(-50%, -50%) translate(var(--ap-x, 40px), var(--ap-y, -40px)) scale(1)",
            opacity: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.25s ease-out",
        "ap-aura": "ap-aura 3s ease-in-out infinite",
        "ap-ring-pulse": "ap-ring-pulse 1.4s ease-in-out infinite",
        "ap-dot-bounce": "ap-dot-bounce 1.2s ease-in-out infinite",
        "ap-sparkle": "ap-sparkle 700ms ease-out forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
