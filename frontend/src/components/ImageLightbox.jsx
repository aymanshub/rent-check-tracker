export default function ImageLightbox({ src, onClose }) {
  if (!src) return null;

  return (
    <div
      className="overlay"
      onClick={onClose}
      style={{ background: "rgba(0,0,0,0.85)", padding: 0 }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 10,
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.2)",
          color: "white",
          fontSize: "1.2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        \u2715
      </button>
      <img
        src={src}
        alt="Check scan"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "95vw",
          maxHeight: "90vh",
          objectFit: "contain",
          borderRadius: 8,
        }}
      />
    </div>
  );
}
