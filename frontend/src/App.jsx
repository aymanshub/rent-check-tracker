import { useState, useEffect, useCallback } from "react";
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
  const { user, loading } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const [selectedBundleId, setSelectedBundleId] = useState(null);
  const [bundlesData, setBundlesData] = useState([]);
  const [allChecks, setAllChecks] = useState([]);

  // Single API call gets everything: bundles + all checks
  const refreshAll = useCallback(async () => {
    try {
      const result = await api.dashboard();
      setBundlesData(result.bundles || []);
      setAllChecks(result.checks || []);
    } catch {
      // ignore — pages show their own errors
    }
  }, []);

  useEffect(() => {
    if (user) refreshAll();
  }, [user, refreshAll]);

  // Build checks cache grouped by bundle_id
  const checksCache = {};
  for (const c of allChecks) {
    if (!checksCache[c.bundle_id]) checksCache[c.bundle_id] = [];
    checksCache[c.bundle_id].push(c);
  }

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

  if (!user) return <LoginPage />;

  const selectedBundle = bundlesData.find((b) => b.id === selectedBundleId);

  if (selectedBundleId) {
    return (
      <>
        <Navbar />
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
      <Navbar />
      <div style={{ paddingBottom: 70 }}>
        {tab === "dashboard" && (
          <DashboardPage
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
        {tab === "settings" && <SettingsPage />}
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
