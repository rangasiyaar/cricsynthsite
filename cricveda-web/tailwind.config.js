/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#06080d",
          secondary: "#0b0e16",
          tertiary: "#111621",
          card: "rgba(255,255,255,0.025)",
        },
        accent: {
          primary: "#6366f1",
          secondary: "#818cf8",
          glow: "rgba(99,102,241,0.12)",
        },
        success: "#10b981",
        border: "rgba(255,255,255,0.06)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      backgroundImage: {
        "accent-gradient": "linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%)",
      },
    },
  },
  plugins: [],
};
