import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { useAuthStore } from "../../store/authStore";
import ThemeToggle from "../ThemeToggle";

const navItems = [
  {
    to: "/admin",
    label: "Dashboard",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: "/admin/torneos",
    label: "Torneos",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M6 9H4.5a2.5 2.5 0 010-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
        <path d="M18 2H6v7a6 6 0 0012 0V2Z" />
      </svg>
    ),
  },
  {
    to: "/admin/canchas",
    label: "Canchas",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="12" y1="3" x2="12" y2="21" />
        <line x1="3" y1="12" x2="21" y2="12" />
      </svg>
    ),
  },
  {
    to: "/admin/estadisticas",
    label: "Estadísticas",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    to: "/admin/configuracion",
    label: "Config",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
];

export default function ClubLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuthStore();
  const nombre = user?.displayName || user?.email?.split("@")[0] || "Admin";

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      {/* Header */}
      <header className="bg-slate-800/95 backdrop-blur-lg px-5 py-3 flex items-center gap-4 sticky top-0 z-30 shadow-lg shadow-slate-900/10">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-slate-300 hover:text-white md:hidden p-1 transition"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <img src="/logo.png" alt="Padely" className="h-7" />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400 hidden sm:block">
            Panel de administración
          </span>
          <ThemeToggle />
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full flex items-center justify-center ring-2 ring-emerald-400/20">
            <span className="text-white text-xs font-bold">
              {nombre.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside
          className={`
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            fixed md:static md:translate-x-0
            w-60 bg-slate-800 md:bg-[var(--sidebar-bg)] border-r border-slate-700 md:border-[var(--sidebar-border)]
            min-h-screen z-20 transition-transform duration-300 ease-in-out
            flex flex-col pt-2
          `}
        >
          <div className="flex flex-col gap-0.5 px-3 py-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/admin"}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                    isActive
                      ? "bg-emerald-50 md:bg-[var(--sidebar-active-bg)] text-emerald-400 md:text-[var(--sidebar-active-text)] font-semibold"
                      : "text-slate-400 md:text-[var(--text-muted)] hover:bg-slate-700/50 md:hover:bg-[var(--bg-card-hover)] hover:text-white md:hover:text-[var(--text-primary)]"
                  }`
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>

          <div className="mt-auto border-t border-slate-700 md:border-slate-200 p-4">
            <NavLink
              to="/hub"
              className="flex items-center gap-3 text-sm text-slate-400 hover:text-emerald-400 md:hover:text-[var(--accent)] transition px-3 py-2 rounded-xl hover:bg-slate-700/50 md:hover:bg-[var(--bg-card-hover)]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
              </svg>
              <span>Ver hub público</span>
            </NavLink>
          </div>
        </aside>

        {/* Overlay mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-10 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-5xl">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
