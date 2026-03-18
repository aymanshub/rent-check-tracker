import { useRef } from "react";
import { useLang } from "../contexts/LangContext";

/**
 * Compresses an image file to JPEG with max width.
 */
async function compressImage(file, maxWidth = 1920, quality = 0.8) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const base64 = dataUrl.split(",")[1];
        resolve({ base64, mimeType: "image/jpeg", dataUrl });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function CheckImageCapture({ onCapture, disabled }) {
  const { t } = useLang();
  const fileRef = useRef();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const compressed = await compressImage(file);
    onCapture(compressed);
  };

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {/* Camera capture (mobile) */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: "none" }}
        id="check-camera"
      />
      <button
        className="btn btn-primary"
        onClick={() => fileRef.current?.click()}
        disabled={disabled}
        style={{ flex: 1 }}
      >
        {t("takePhoto")}
      </button>

      {/* File picker fallback */}
      <input
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: "none" }}
        id="check-file"
      />
      <button
        className="btn btn-outline"
        onClick={() => document.getElementById("check-file")?.click()}
        disabled={disabled}
        style={{ flex: 1 }}
      >
        {t("chooseFile")}
      </button>
    </div>
  );
}
