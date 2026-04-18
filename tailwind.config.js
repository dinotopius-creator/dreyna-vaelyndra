/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Royaume de Vaelyndra — palette elfique royale
        night: {
          900: "#0a0514",
          800: "#110825",
          700: "#180c35",
          600: "#1f1145",
        },
        royal: {
          900: "#2a0f4f",
          800: "#3a1770",
          700: "#4d1f96",
          600: "#6a2fc7",
          500: "#8b4df0",
          400: "#a97aff",
          300: "#c9a6ff",
        },
        gold: {
          900: "#5c3d0a",
          700: "#9a6a18",
          500: "#d4a94a",
          400: "#e6c274",
          300: "#f2dca3",
          200: "#fbeecb",
        },
        celeste: {
          500: "#7fd8ff",
          400: "#a8e6ff",
          300: "#cdf0ff",
        },
        ivory: "#f7f2ea",
      },
      fontFamily: {
        display: ["'Cinzel Decorative'", "'Cinzel'", "serif"],
        serif: ["'Cormorant Garamond'", "Georgia", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(169, 122, 255, 0.35), 0 0 80px rgba(212, 169, 74, 0.15)",
        "glow-gold": "0 0 28px rgba(230, 194, 116, 0.45)",
        "glow-violet": "0 0 28px rgba(169, 122, 255, 0.55)",
        card: "0 10px 40px -10px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
      },
      backgroundImage: {
        "royal-gradient":
          "linear-gradient(135deg, #0a0514 0%, #1f1145 50%, #2a0f4f 100%)",
        "gold-shine":
          "linear-gradient(135deg, #f2dca3 0%, #d4a94a 40%, #9a6a18 100%)",
        "aurora":
          "radial-gradient(ellipse at top, rgba(169,122,255,0.35), transparent 55%), radial-gradient(ellipse at bottom, rgba(212,169,74,0.2), transparent 60%)",
      },
      keyframes: {
        shimmer: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(169,122,255,0.4)" },
          "50%": { boxShadow: "0 0 40px rgba(230,194,116,0.6)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        shimmer: "shimmer 6s ease-in-out infinite",
        float: "float 5s ease-in-out infinite",
        "glow-pulse": "glowPulse 3s ease-in-out infinite",
        "fade-up": "fadeUp 0.8s ease-out both",
      },
    },
  },
  plugins: [],
};
