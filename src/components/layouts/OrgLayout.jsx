import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { useAuthStore } from "../../store/authStore";

const navItems = [
  {
    to: "/org",
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
    to: "/org/torneos",
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
    to: "/org/estadisticas",
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
    to: "/org/entidad",
    label: "Mi entidad",
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
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    to: "/org/equipo",
    label: "Equipo",
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
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
];

export default function OrgLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuthStore();
  const nombre =
    user?.displayName || user?.email?.split("@")[0] || "Organizador";

  return (
    <div className="min-h-screen bg-[#f5f7fa] flex flex-col">
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
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-green-600 rounded-xl flex items-center justify-center shadow-md shadow-green-900/20">
            <span className="text-white font-bold text-sm">P</span>
          </div>
          <span className="text-white font-bold text-lg tracking-tight">
            Padely
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400 hidden sm:block">
            Panel organizador
          </span>
          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center ring-2 ring-blue-400/20">
            <span className="text-white text-xs font-bold">
              {nombre.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          className={`
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            fixed md:sticky md:top-[52px] md:translate-x-0
            w-60 bg-slate-800 md:bg-white border-r border-slate-700 md:border-slate-200
            h-[calc(100vh-52px)] z-20 transition-transform duration-300 ease-in-out
            flex flex-col pt-2 shrink-0
          `}
        >
          <div className="flex flex-col gap-0.5 px-3 py-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/org"}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                    isActive
                      ? "bg-blue-50 md:bg-blue-50 text-blue-400 md:text-blue-700 font-semibold shadow-sm shadow-blue-100/50"
                      : "text-slate-400 md:text-slate-500 hover:bg-slate-700/50 md:hover:bg-slate-50 hover:text-white md:hover:text-slate-700"
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
              className="flex items-center gap-3 text-sm text-slate-400 hover:text-blue-400 md:hover:text-blue-600 transition px-3 py-2 rounded-xl hover:bg-slate-700/50 md:hover:bg-slate-50"
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

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-10 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-5xl w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
