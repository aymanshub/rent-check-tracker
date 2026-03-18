import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { GOOGLE_CLIENT_ID } from "../config";
import { api } from "../services/api";

const AuthContext = createContext();

function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { email, name, role, family }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const logout = useCallback(() => {
    localStorage.removeItem("id_token");
    api.clearCache();
    setUser(null);
    setError(null);
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  }, []);

  const verifyAndSetUser = useCallback(async (idToken) => {
    setLoading(true);
    setError(null);
    try {
      localStorage.setItem("id_token", idToken);
      const info = await api.getUserInfo();
      if (info.error) {
        setError(info.error);
        localStorage.removeItem("id_token");
        setUser(null);
      } else {
        const decoded = decodeJwt(idToken);
        setUser({
          email: info.email || decoded?.email || "",
          name: info.name || decoded?.name || decoded?.email || "",
          picture: decoded?.picture || "",
          role: info.role || "member",
          family: info.family || "",
        });
      }
    } catch (err) {
      setError(err.message);
      localStorage.removeItem("id_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCredentialResponse = useCallback((response) => {
    verifyAndSetUser(response.credential);
  }, [verifyAndSetUser]);

  // Initialize GIS
  useEffect(() => {
    const initGIS = () => {
      if (!window.google?.accounts?.id) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: true,
        itp_support: true,
      });

      // Check for existing token
      const existing = localStorage.getItem("id_token");
      if (existing) {
        const decoded = decodeJwt(existing);
        const now = Date.now() / 1000;
        if (decoded?.exp && decoded.exp > now) {
          verifyAndSetUser(existing);
        } else {
          localStorage.removeItem("id_token");
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    // GIS script may already be loaded or still loading
    if (window.google?.accounts?.id) {
      initGIS();
    } else {
      // Poll for it
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          initGIS();
        }
      }, 100);
      // Give up after 10s
      setTimeout(() => {
        clearInterval(interval);
        setLoading(false);
      }, 10000);
    }

    // Listen for auth expiry from API layer
    const handleExpired = () => logout();
    window.addEventListener("auth-expired", handleExpired);
    return () => window.removeEventListener("auth-expired", handleExpired);
  }, [handleCredentialResponse, verifyAndSetUser, logout]);

  const renderSignInButton = useCallback((element) => {
    if (element && window.google?.accounts?.id) {
      window.google.accounts.id.renderButton(element, {
        theme: "outline",
        size: "large",
        width: 300,
        text: "signin_with",
        shape: "pill",
      });
    }
  }, []);

  const isAdmin = user?.role === "admin";

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, error, logout, renderSignInButton }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
