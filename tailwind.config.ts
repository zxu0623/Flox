import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./popup.html", "./dashboard.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        flox: ['"Outfit"', "Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
