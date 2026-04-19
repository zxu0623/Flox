import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./popup.html", "./dashboard.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        flox: ['"Lora"', 'Georgia', '"Times New Roman"', 'serif'],
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // ─── Warm stone palette — replaces cool zinc ──────────────────
        zinc: {
          50:  '#FAFAF8',
          100: '#F5F2EC',
          200: '#EAE4DA',
          300: '#D6CEC4',
          400: '#BCB4A8',
          500: '#9C9287',
          600: '#796F68',
          700: '#5A524C',
          800: '#3C3630',
          900: '#252018',
          950: '#16130E',
        },
        // ─── Claude's signature warm orange replaces cool amber ───────
        amber: {
          50:  '#FDF6EE',
          100: '#FBE8D4',
          200: '#F7CFA7',
          300: '#F0AF72',
          400: '#D97446',   // primary accent (was #FBBF24)
          500: '#C96B38',   // hover/active deeper warm orange
          600: '#A8562A',
          700: '#843F1D',
          800: '#5F2A0E',
          900: '#3F1C09',
          950: '#2A1206',
        },
      }
    }
  },
  plugins: []
} satisfies Config;
