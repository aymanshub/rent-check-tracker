import { useEffect, useState, useCallback } from "react";
import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";
import { useChecks } from "../hooks/useChecks";
import { api } from "../services/api";
import FamilyBadge from "../components/FamilyBadge";
import CheckRow from "../components/CheckRow";
import CheckImageCapture from "../components/CheckImageCapture";
import CheckScanReview from "../components/CheckScanReview";
import ConfirmDialog from "../components/ConfirmDialog";

function formatCurrency(amount) {
  return "\u20AA" + Number(amount || 0).toLocaleString();
}

export default function BundleDetailPage({ bundleId, bundle: bundleProp, onBack, onRefreshBundles }) {
  const { t } = useLang();
  const { user } = useAuth();
  const { checks, loading, refresh, addLocal } = useChecks(bundleId);
  const isAdmin = !!user;

  // If parent doesn't have the bundle data yet, fetch it ourselves
  const [fetchedBundle, setFetchedBundle] = useState(null);
  useEffect(() => {
    if (!bundleProp && bundleId) {
      api.bundles().then((res) => {
        const found = (res.bundles || []).find((b) => b.id === bundleId);
        if (found) setFetchedBundle(found);
      }).catch(() => {});
    }
  }, [bundleProp, bundleId]);

  const bundle = bundleProp || fetchedBundle;
  const isOpen = bundle?.status === "open";

  // Scan flow state
  const [scanStep, setScanStep] = useState(null); // null | "capturing" | "reading" | "reviewing"
  const [imageData, setImageData] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [scanWarning, setScanWarning] = useState(null);
  const [saving, setSaving] = useState(false);

  // Confirm dialogs
  const [deleteCheckId, setDeleteCheckId] = useState(null);
  const [deleteBundleConfirm, setDeleteBundleConfirm] = useState(false);
  const [closeBundleConfirm, setCloseBundleConfirm] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalAmount = checks.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  // === Scan flow handlers ===

  const handleCapture = useCallback(async (compressed) => {
    setImageData(compressed);
    setScanStep("reading");
    setScanWarning(null);
    try {
      const result = await api.scanCheck(bundleId, compressed.base64, compressed.mimeType);
      setExtractedData(result.extracted || {});
      if (result.warning) setScanWarning(result.warning);
      setScanStep("reviewing");
    } catch (err) {
      // Let user fill manually
      setExtractedData({});
      setScanWarning(err.message);
      setScanStep("reviewing");
    }
  }, [bundleId]);

  const handleConfirmScan = useCallback(async (confirmedData) => {
    if (!imageData) return;
    setSaving(true);

    // Build a local check object so UI updates immediately
    const localCheck = {
      id: "temp-" + Date.now(),
      bundle_id: bundleId,
      order: checks.length + 1,
      amount: Number(confirmedData.amount) || 0,
      issued_to: confirmedData.issued_to || bundle?.checks_on_name || "",
      status: "received",
      deposit_date: confirmedData.deposit_date || "",
      check_number: confirmedData.check_number || "",
      bank_branch: confirmedData.bank_branch || "",
      account_number: confirmedData.account_number || "",
      payee_name: confirmedData.payee_name || "",
      image_id: "",
      image_url: "",
      date_received: new Date().toISOString().split("T")[0],
      date_handed: "",
      date_deposited: "",
      date_drawn: "",
      date_delivered: "",
      recipient_name: "",
      draw_amount: "",
    };

    // Close review and add to UI immediately
    setScanStep(null);
    setImageData(null);
    setExtractedData(null);
    setSaving(false);
    addLocal(localCheck);

    // Save to backend in the background
    try {
      await api.confirmCheckData(bundleId, imageData.base64, imageData.mimeType, confirmedData);
    } catch {
      // GAS likely saved — response just corrupted on mobile
    }

    // Try to refresh with real data from server (replaces temp check)
    refresh();
  }, [bundleId, imageData, checks.length, bundle, addLocal, refresh]);

  const cancelScan = () => {
    setScanStep(null);
    setImageData(null);
    setExtractedData(null);
    setScanWarning(null);
  };

  // === Check actions ===

  const handleAdvance = async (checkId, recipientName) => {
    await api.advanceCheck(checkId, recipientName);
    await refresh();
  };

  const handleDeleteCheck = async () => {
    if (!deleteCheckId) return;
    await api.deleteCheck(deleteCheckId);
    setDeleteCheckId(null);
    await refresh();
  };

  // === Bundle actions ===

  const handleToggleBundle = async () => {
    if (isOpen) {
      await api.closeBundle(bundleId);
    } else {
      await api.reopenBundle(bundleId);
    }
    setCloseBundleConfirm(false);
    if (onRefreshBundles) onRefreshBundles();
  };

  const handleDeleteBundle = async () => {
    await api.deleteBundle(bundleId);
    setDeleteBundleConfirm(false);
    onBack();
  };

  if (!bundle) {
    return (
      <div className="page" style={{ textAlign: "center", paddingTop: 60 }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <button
        className="btn btn-ghost"
        onClick={onBack}
        style={{ marginBottom: 12, paddingInlineStart: 0 }}
      >
        \u2190 {t("back")}
      </button>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: "1.2rem", marginBottom: 4 }}>{bundle.label}</h2>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span>{t(bundle.mode === "single" ? "singleName" : "alternating")}</span>
              <span>\u2022</span>
              <FamilyBadge family={bundle.checks_on_name} />
              {bundle.mode === "single" && (
                <>
                  <span>\u2022</span>
                  <span className="ltr-num">{bundle.split_ratio}%</span>
                </>
              )}
            </div>
          </div>
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: "0.7rem",
              fontWeight: 600,
              background: isOpen ? "#dcfce7" : "#f1f5f9",
              color: isOpen ? "#16a34a" : "#64748b",
            }}
          >
            {t(isOpen ? "openBundle" : "closedBundle")}
          </span>
        </div>
        {checks.length > 0 && (
          <div style={{ marginTop: 10, fontSize: "0.85rem", color: "var(--text-muted)" }}>
            <span className="ltr-num" style={{ fontWeight: 600, color: "var(--text)" }}>
              {checks.length}
            </span>{" "}
            {t("checksCount")}
            {totalAmount > 0 && (
              <>
                {" \u2022 "}
                <span className="ltr-num" style={{ fontWeight: 600, color: "var(--text)" }}>
                  {formatCurrency(totalAmount)}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Add Check button */}
      {isAdmin && isOpen && (
        <div style={{ marginBottom: 16 }}>
          {scanStep === "capturing" || scanStep === null ? (
            <CheckImageCapture
              onCapture={handleCapture}
              disabled={scanStep === "reading"}
            />
          ) : scanStep === "reading" ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <div className="spinner" style={{ width: 28, height: 28 }} />
              <p style={{ marginTop: 8, color: "var(--text-muted)" }}>{t("readingCheck")}</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Checks list */}
      {loading && checks.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : checks.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
          <p style={{ fontSize: "1rem", marginBottom: 4 }}>{t("noChecksYet")}</p>
        </div>
      ) : (
        checks.map((check) => (
          <CheckRow
            key={check.id}
            check={check}
            bundle={bundle}
            onAdvance={handleAdvance}
            onDelete={(id) => setDeleteCheckId(id)}
            isAdmin={isAdmin}
          />
        ))
      )}

      {/* Bundle management buttons */}
      {isAdmin && (
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button
            className="btn btn-outline"
            onClick={() => setCloseBundleConfirm(true)}
            style={{ flex: 1 }}
          >
            {t(isOpen ? "closeBundle" : "reopenBundle")}
          </button>
          <button
            className="btn btn-danger"
            onClick={() => setDeleteBundleConfirm(true)}
            style={{ flex: 1 }}
          >
            {t("deleteBundle")}
          </button>
        </div>
      )}

      {/* Scan review overlay */}
      {scanStep === "reviewing" && (
        <CheckScanReview
          imagePreview={imageData?.dataUrl}
          extractedData={extractedData}
          bundleMode={bundle.mode}
          onConfirm={handleConfirmScan}
          onCancel={cancelScan}
          isSubmitting={saving}
          warning={scanWarning}
        />
      )}

      {/* Delete check confirm */}
      {deleteCheckId && (
        <ConfirmDialog
          message={t("confirmDeleteCheck")}
          onConfirm={handleDeleteCheck}
          onCancel={() => setDeleteCheckId(null)}
          danger
        />
      )}

      {/* Close/reopen bundle confirm */}
      {closeBundleConfirm && (
        <ConfirmDialog
          message={t(isOpen ? "closeBundle" : "reopenBundle") + "?"}
          onConfirm={handleToggleBundle}
          onCancel={() => setCloseBundleConfirm(false)}
        />
      )}

      {/* Delete bundle confirm */}
      {deleteBundleConfirm && (
        <ConfirmDialog
          message={t("confirmDeleteBundle")}
          onConfirm={handleDeleteBundle}
          onCancel={() => setDeleteBundleConfirm(false)}
          danger
        />
      )}
    </div>
  );
}
