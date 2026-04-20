import colors from "tailwindcss/colors";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        // Map amber to cyan (DeGirum style primary color)
        amber: colors.cyan,
        // Map orange to cyan for primary buttons
        orange: colors.cyan,
        // Map zinc to slate (Cooler, more tech-focused gray)
        zinc: colors.slate,
      }
    },
  },
  plugins: [],
};
