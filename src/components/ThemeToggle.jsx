import { Moon, Sun } from "lucide-react";
import useThemeStore from "../store/themeStore";
import Button from "./ui/Button";

// Cambia entre Día y Noche: botón ghost solo ícono; el label dice a qué modo pasa.
export default function ThemeToggle({ className = "" }) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isDark = theme === "dark";
  const label = isDark ? "Modo claro" : "Modo oscuro";

  return (
    <Button
      variant="ghost"
      iconOnly
      aria-label={label}
      title={label}
      onClick={toggleTheme}
      className={className}
      icon={
        isDark ? <Sun className="pd-icon" size={20} aria-hidden="true" /> : <Moon className="pd-icon" size={20} aria-hidden="true" />
      }
    />
  );
}
