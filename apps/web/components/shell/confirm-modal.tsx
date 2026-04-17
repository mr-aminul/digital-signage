"use client";

export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
}: ConfirmModalProps) {
  if (!open) return null;

  const confirmStyle: React.CSSProperties =
    variant === "danger"
      ? {
          background: "#DC2626",
          color: "#fff",
          border: "none",
          padding: "0.5rem 1rem",
          borderRadius: "0.375rem",
          fontSize: "0.875rem",
          fontWeight: 600,
          cursor: "pointer",
        }
      : {
          background: "#111827",
          color: "#fff",
          border: "none",
          padding: "0.5rem 1rem",
          borderRadius: "0.375rem",
          fontSize: "0.875rem",
          fontWeight: 600,
          cursor: "pointer",
        };

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 9998,
        }}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby={message ? "confirm-modal-desc" : undefined}
        style={{
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          background: "#fff",
          borderRadius: "0.5rem",
          boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
          padding: "1.25rem 1.5rem",
          minWidth: "18rem",
          maxWidth: "24rem",
          zIndex: 9999,
        }}
      >
        <h3 id="confirm-modal-title" style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#111827" }}>
          {title}
        </h3>
        {message && (
          <p
            id="confirm-modal-desc"
            style={{
              margin: "0.5rem 0 1.25rem",
              fontSize: "0.875rem",
              color: "#6B7280",
              lineHeight: 1.5,
            }}
          >
            {message}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              border: "0.0625rem solid #E5E7EB",
              background: "#fff",
              color: "#374151",
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} style={confirmStyle}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
