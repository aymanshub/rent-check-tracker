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
  const [checksCache, setChecksCache] = useState({});

  const refreshBundles = useCallback(async () => {
    try {
      const result = await api.bundles();
      setBundlesData(result.bundles || []);
    } catch {
      // Pages have their own error handling
    }
  }, []);

  useEffect(() => {
    if (user) refreshBundles();
  }, [user, refreshBundles]);

  const loadChecks = useCallback(async (bundleId) => {
    try {
      const result = await api.checks(bundleId);
      setChecksCache((prev) => ({ ...prev, [bundleId]: result.checks || [] }));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    bundlesData.forEach((b) => {
      if (!checksCache[b.id]) loadChecks(b.id);
    });
  }, [bundlesData, checksCache, loadChecks]);

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
          onBack={() => {
            setSelectedBundleId(null);
            refreshBundles();
          }}
          onRefreshBundles={refreshBundles}
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
            onNavigateBundle={setSelectedBundleId}
            checksCache={checksCache}
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
