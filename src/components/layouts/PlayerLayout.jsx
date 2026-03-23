import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/hub", label: "Canchas", icon: "⊞" },
  { to: "/torneos", label: "Torneos", icon: "🏆" },
  { to: "/noticias", label: "Noticias", icon: "📰" },
  { to: "/marketplace", label: "Tienda", icon: "🛒" },
  { to: "/perfil", label: "Perfil", icon: "👤" },
];

export default function PlayerLayout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <span className="text-green-700 font-bold text-xl">Padely</span>
        <span className="text-sm text-gray-500">Bienvenido</span>
      </header>

      <main className="flex-1 overflow-y-auto pb-20 px-4 pt-4">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-10">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 text-xs px-2 py-1 rounded-lg transition ${
                isActive ? "text-green-600 font-semibold" : "text-gray-400"
              }`
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
