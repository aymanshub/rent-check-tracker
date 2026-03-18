import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { useLang } from "../contexts/LangContext";

/**
 * Crops a dataUrl image using pixel coordinates from react-easy-crop.
 * Returns { base64, mimeType, dataUrl }.
 */
function cropImage(dataUrl, pixelCrop) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;
      canvas.getContext("2d").drawImage(
        img,
        pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, pixelCrop.width, pixelCrop.height
      );
      const croppedUrl = canvas.toDataURL("image/jpeg", 0.85);
      const base64 = croppedUrl.split(",")[1];
      resolve({ base64, mimeType: "image/jpeg", dataUrl: croppedUrl });
    };
    img.src = dataUrl;
  });
}

export default function CheckImageCrop({ imageDataUrl, onConfirm, onCancel }) {
  const { t } = useLang();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    const cropped = await cropImage(imageDataUrl, croppedAreaPixels);
    onConfirm(cropped);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#000",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Crop area */}
      <div style={{ position: "relative", flex: 1 }}>
        <Cropper
          image={imageDataUrl}
          crop={crop}
          zoom={zoom}
          aspect={16 / 9}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          style={{
            containerStyle: { background: "#000" },
          }}
        />
      </div>

      {/* Controls */}
      <div
        style={{
          padding: "12px 16px",
          background: "rgba(0,0,0,0.9)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Zoom slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#aaa", fontSize: "0.75rem" }}>-</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ color: "#aaa", fontSize: "0.75rem" }}>+</span>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={processing}
            style={{ flex: 1 }}
          >
            {processing ? (
              <span className="spinner" style={{ width: 16, height: 16 }} />
            ) : (
              t("confirmCrop")
            )}
          </button>
          <button
            className="btn btn-outline"
            onClick={onCancel}
            disabled={processing}
            style={{ flex: 1, color: "white", borderColor: "rgba(255,255,255,0.3)" }}
          >
            {t("retake")}
          </button>
        </div>
      </div>
    </div>
  );
}
