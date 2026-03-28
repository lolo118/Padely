import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { useAuthStore } from "../../store/authStore";

const navItems = [
  {
    to: "/inicio",
    label: "Inicio",
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
    to: "/hub",
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
    to: "/torneos",
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
    to: "/marketplace",
    label: "Tienda",
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
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    ),
  },
  {
    to: "/perfil",
    label: "Perfil",
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
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

const menuItems = [
  { to: "/inicio", label: "Inicio" },
  { to: "/hub", label: "Canchas disponibles" },
  { to: "/torneos", label: "Torneos" },
  { to: "/noticias", label: "Noticias" },
  { to: "/marketplace", label: "Tienda" },
  { to: "/perfil", label: "Mi perfil" },
];

export default function PlayerLayout() {
  const { user } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const nombre = user?.displayName || user?.email?.split("@")[0] || "Jugador";

  return (
    <div className="min-h-screen bg-[#f5f7fa] flex flex-col">
      {/* Header */}
      <header className="bg-slate-800/95 backdrop-blur-lg px-5 py-3 flex items-center justify-between sticky top-0 z-30 shadow-lg shadow-slate-900/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-slate-300 hover:text-white p-1 transition md:hidden"
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
              {menuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
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
        </div>
        <NavLink
          to="/perfil"
          className="flex items-center gap-2 hover:opacity-80 transition"
        >
          <span className="text-xs text-slate-400 hidden sm:block">
            {nombre}
          </span>
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full flex items-center justify-center ring-2 ring-emerald-400/20">
            <span className="text-white text-xs font-bold">
              {nombre.charAt(0).toUpperCase()}
            </span>
          </div>
        </NavLink>
      </header>

      {/* Menu hamburguesa mobile */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-20 md:hidden"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed top-[52px] left-0 right-0 bg-slate-800 z-20 md:hidden shadow-xl border-b border-slate-700">
            <div className="flex flex-col py-2">
              {menuItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `px-6 py-3 text-sm transition ${
                      isActive
                        ? "text-emerald-400 font-semibold bg-slate-700/50"
                        : "text-slate-300 hover:text-white hover:bg-slate-700/30"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="border-t border-slate-700 mt-1 pt-1">
                <button
                  onClick={async () => {
                    setMenuOpen(false);
                    const { signOut } = await import("firebase/auth");
                    const { auth } = await import("../../lib/firebase");
                    await signOut(auth);
                    window.location.href = "/login";
                  }}
                  className="w-full text-left px-6 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-slate-700/30 transition"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Main */}
      <main className="flex-1 overflow-y-auto pb-24 px-4 sm:px-6 pt-5 max-w-4xl mx-auto w-full">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl transition-all duration-200 ${
                  isActive
                    ? "text-emerald-600"
                    : "text-slate-400 hover:text-slate-600"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`transition-all duration-200 ${isActive ? "scale-110" : ""}`}
                  >
                    {item.icon}
                  </div>
                  <span
                    className={`text-[10px] tracking-wide ${isActive ? "font-bold" : "font-medium"}`}
                  >
                    {item.label}
                  </span>
                  {isActive && (
                    <div className="w-1 h-1 bg-emerald-500 rounded-full -mt-0.5" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
