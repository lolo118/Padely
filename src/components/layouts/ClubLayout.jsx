import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";

const navItems = [
  { to: "/admin/torneos", label: "Torneos", icon: "🏆" },
  { to: "/admin/canchas", label: "Canchas", icon: "⊞" },
  { to: "/admin/estadisticas", label: "Estadísticas", icon: "📊" },
  { to: "/admin/configuracion", label: "Configuración", icon: "⚙️" },
];

export default function ClubLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 sticky top-0 z-10">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-gray-500 hover:text-gray-700 md:hidden"
        >
          ☰
        </button>
        <span className="text-green-700 font-bold text-xl">Padely</span>
        <span className="ml-auto text-sm text-gray-500">Panel de club</span>
      </header>

      <div className="flex flex-1">
        <aside
          className={`
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          fixed md:static md:translate-x-0
          w-56 bg-white border-r border-gray-200
          min-h-screen z-20 transition-transform duration-200
          flex flex-col pt-4
        `}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 text-sm transition ${
                  isActive
                    ? "bg-green-50 text-green-700 font-semibold border-r-2 border-green-600"
                    : "text-gray-600 hover:bg-gray-50"
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}

          <div className="mt-auto border-t border-gray-100 p-4">
            <NavLink
              to="/hub"
              className="flex items-center gap-3 text-sm text-gray-500 hover:text-green-600 transition"
            >
              <span>🌐</span>
              <span>Ver hub público</span>
            </NavLink>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-30 z-10 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
