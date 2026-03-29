import useThemeStore from "../store/themeStore";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      className="relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none"
      style={{ backgroundColor: isDark ? "#064e3b" : "#cbd5e1" }}
      title={isDark ? "Modo claro" : "Modo oscuro"}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 rounded-full shadow-md transition-all duration-300 flex items-center justify-center ${
          isDark ? "translate-x-6 bg-emerald-400" : "translate-x-0.5 bg-white"
        }`}
      >
        {isDark ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2.5" className="w-3 h-3">
            <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" className="w-3 h-3">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        )}
      </div>
    </button>
  );
}
