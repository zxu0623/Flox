import type { Config } from "tailwindcss";

export default {
  content: ["./popup.html", "./dashboard.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {}
  },
  plugins: []
} satisfies Config;
