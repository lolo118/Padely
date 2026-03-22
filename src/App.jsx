import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthChange } from "./services/authService";
import { useAuthStore } from "./store/authStore";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Cargando...
      </div>
    );
  if (!user) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const unsub = onAuthChange((user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsub();
  }, [setUser, setLoading]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div className="min-h-screen flex items-center justify-center text-green-700 text-xl font-bold">
                Bienvenido a Padely
              </div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
