
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { User as FirebaseUser } from "firebase/auth";

import {
  Package,
  Truck,
  Bell,
  Search,
  LogOut,
} from "lucide-react";

import InventoryPage from "./pages/InventoryPage";
import SuppliersPage from "./pages/SuppliersPage";

import {
  login,
  logout,
  onAuthChange,
  getUserRole,
} from "./services/authService";

type ActivePage = "inventory" | "suppliers";

function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState("");

  const [activePage, setActivePage] =
    useState<ActivePage>("inventory");

  useEffect(() => {
    const unsubscribe = onAuthChange(async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        try {
          const userRole = await getUserRole(currentUser.uid);
          setRole(userRole);
        } catch (err) {
          console.error("Could not fetch user role:", err);
          setRole(null);
        }
      } else {
        setRole(null);
      }

      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoginLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      console.error("Login failed:", err);
      setError("Invalid email or password. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    setRole(null);
    setActivePage("inventory");
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading application...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F3F7FF] flex items-center justify-center p-5">
        <form
          onSubmit={handleLogin}
          className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md"
        >
          <h1 className="text-2xl font-bold text-[#14294B] mb-2">
            SupplyChain<span className="text-blue-600">.</span>
          </h1>

          <p className="text-slate-500 mb-7">
            Sign in to your Cloud Management Platform
          </p>

          <label className="block text-sm font-medium mb-2">
            Email
          </label>

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg p-3 mb-5"
            placeholder="Enter your email"
          />

          <label className="block text-sm font-medium mb-2">
            Password
          </label>

          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-lg p-3 mb-5"
            placeholder="Enter your password"
          />

          {error && (
            <p className="text-red-600 text-sm mb-4">{error}</p>
          )}

          <button
            type="submit"
            disabled={loginLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-3 font-semibold disabled:opacity-50"
          >
            {loginLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-5">
        <p className="text-red-600 font-semibold mb-3">
          Your account has no assigned application role.
        </p>

        <p className="text-slate-500 mb-5">
          Contact the project administrator to configure your user record.
        </p>

        <button
          onClick={handleLogout}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg"
        >
          Sign out
        </button>
      </div>
    );
  }

  const pageTitle =
    activePage === "inventory"
      ? "Inventory / Overview"
      : "Suppliers / Overview";

  return (
    <div className="min-h-screen bg-[#F3F7FF] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-blue-100 min-h-screen hidden md:flex flex-col">
        <div className="p-6 border-b border-blue-100">
          <h1 className="text-xl font-bold text-[#14294B]">
            SupplyChain<span className="text-blue-600">.</span>
          </h1>

          <p className="text-xs text-slate-400 mt-1">
            Cloud Management Platform
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs text-slate-400 font-semibold mb-3 px-3">
            WORKSPACE
          </p>

          {/* Inventory navigation */}
          <button
            onClick={() => setActivePage("inventory")}
            className={`w-full flex items-center gap-3 p-3 rounded-lg text-sm transition ${
              activePage === "inventory"
                ? "bg-blue-50 text-blue-700 font-semibold"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Package size={19} />
            Inventory
          </button>

          {/* Suppliers navigation */}
          <button
            onClick={() => setActivePage("suppliers")}
            className={`w-full flex items-center gap-3 p-3 rounded-lg text-sm mt-2 transition ${
              activePage === "suppliers"
                ? "bg-blue-50 text-blue-700 font-semibold"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Truck size={19} />
            Suppliers
          </button>
        </div>

        <div className="mt-auto p-5 border-t border-blue-100">
          <p className="text-xs text-slate-400">
            SUPPLYCHAIN CLOUD
          </p>

          <p className="text-xs text-slate-400 mt-1">
            Inventory & Supplier Management
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <header className="h-20 bg-white border-b border-blue-100 flex items-center justify-between px-5 md:px-8">
          <div>
            <p className="text-sm text-slate-400">
              Workspace
            </p>

            <div className="text-sm font-semibold text-[#14294B]">
              {pageTitle}
            </div>
          </div>

          <div className="flex items-center gap-5">
            <Search size={20} className="text-slate-500" />
            <Bell size={20} className="text-slate-500" />

            <div className="text-right">
              <p className="text-sm font-semibold text-[#14294B]">
                {user.email}
              </p>

              <p className="text-xs text-slate-400 capitalize">
                {role.replace("_", " ")}
              </p>
            </div>

            <button
              onClick={handleLogout}
              title="Sign out"
              className="text-slate-500 hover:text-red-600"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <div className="p-5 md:p-8 max-w-[1500px] mx-auto">
          {activePage === "inventory" ? (
            <InventoryPage />
          ) : (
            <SuppliersPage />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
