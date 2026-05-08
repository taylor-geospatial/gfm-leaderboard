/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1480px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        // Brand
        brand: {
          DEFAULT: "#FF4F2C",
          50: "#FFF2EE",
          100: "#FFE3DA",
          200: "#FFC4B1",
          300: "#FF9E81",
          400: "#FF7657",
          500: "#FF4F2C",
          600: "#E83A18",
          700: "#B82C12",
          800: "#7C1F0E",
          900: "#3B1E1C",
        },
        // TG secondary palette
        periwinkle: "#80a0d8",
        "light-blue": "#a7d0dc",
        "tg-green": "#cff29e",
        chart: {
          1: "#FF4F2C",  /* TG red */
          2: "#80a0d8",  /* TG periwinkle */
          3: "#a7d0dc",  /* TG light blue */
          4: "#cff29e",  /* TG green */
          5: "#C8803E",  /* warm amber */
          6: "#8E5BCB",  /* purple */
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Space Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SF Mono", "monospace"],
      },
      fontSize: {
        // tighter than Tailwind defaults — Cursor/Linear-style
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.04em" }],
      },
      boxShadow: {
        pop: "0 0 0 1px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.04), 0 4px 16px -4px rgba(0,0,0,.10), 0 12px 32px -8px rgba(0,0,0,.06)",
        card: "0 0 0 1px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.03)",
        ring: "0 0 0 4px hsl(var(--ring) / 0.15)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      animation: {
        in: "in 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        in: {
          "0%": { opacity: 0, transform: "translateY(4px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
