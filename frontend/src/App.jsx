import { useState, useEffect, useCallback, useMemo } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LangProvider } from "./contexts/LangContext";
import Navbar from "./components/Navbar";
import TabBar from "./components/TabBar";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import BundlesPage from "./pages/BundlesPage";
import BundleDetailPage from "./pages/BundleDetailPage";
import SettingsPage from "./pages/SettingsPage";
import { api } from "./services/api";

function AppContent() {
  const { user, isAdmin, loading } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const [selectedBundleId, setSelectedBundleId] = useState(null);
  const [bundlesData, setBundlesData] = useState([]);
  const [allChecks, setAllChecks] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [settings, setSettings] = useState({});

  // Single API call gets everything: bundles + all checks + stats + settings
  const refreshAll = useCallback(async () => {
    try {
      const result = await api.dashboard();
      setBundlesData(result.bundles || []);
      setAllChecks(result.checks || []);
      setDashboardStats({
        total: result.total || 0,
        awaiting_action: result.awaiting_action || 0,
        completed: result.completed || 0,
      });
      if (result.settings) setSettings(result.settings);
    } catch {
      // ignore — pages show their own errors
    }
  }, []);

  useEffect(() => {
    if (user) refreshAll();
  }, [user, refreshAll]);

  // Build checks cache grouped by bundle_id (memoized)
  const checksCache = useMemo(() => {
    const cache = {};
    for (const c of allChecks) {
      if (!cache[c.bundle_id]) cache[c.bundle_id] = [];
      cache[c.bundle_id].push(c);
    }
    return cache;
  }, [allChecks]);

  // Allow child components to add a check optimistically
  const addCheckLocal = useCallback((check) => {
    setAllChecks((prev) => [...prev, check]);
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="spinner" style={{ width: 36, height: 36 }} />
      </div>
    );
  }

  if (!user) return <LoginPage settings={settings} />;

  const selectedBundle = bundlesData.find((b) => b.id === selectedBundleId);

  if (selectedBundleId) {
    return (
      <>
        <Navbar settings={settings} />
        <BundleDetailPage
          bundleId={selectedBundleId}
          bundle={selectedBundle}
          checks={checksCache[selectedBundleId] || []}
          onBack={() => {
            setSelectedBundleId(null);
            refreshAll();
          }}
          onRefreshAll={refreshAll}
          onAddCheckLocal={addCheckLocal}
        />
      </>
    );
  }

  return (
    <>
      <Navbar settings={settings} />
      <div style={{ paddingBottom: 70 }}>
        {tab === "dashboard" && (
          <DashboardPage
            stats={dashboardStats}
            bundles={bundlesData}
            onNavigateBundle={setSelectedBundleId}
            checksCache={checksCache}
          />
        )}
        {tab === "bundles" && (
          <BundlesPage
            bundles={bundlesData}
            onNavigateBundle={setSelectedBundleId}
            checksCache={checksCache}
            onRefreshAll={refreshAll}
          />
        )}
        {tab === "settings" && <SettingsPage settings={settings} onSettingsChange={setSettings} />}
      </div>
      <TabBar active={tab} onNavigate={setTab} />
    </>
  );
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LangProvider>
  );
}
