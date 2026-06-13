"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { getGoogleAuthCallbackUrl } from "@/lib/auth/app-url";

const styles: Record<string, React.CSSProperties> = {
  divider: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    margin: "0.25rem 0",
  },
  dividerLine: {
    flex: 1,
    height: "0.0625rem",
    background: "#e5e7eb",
  },
  dividerText: {
    fontSize: "0.75rem",
    color: "#9ca3af",
    fontWeight: 500,
  },
  button: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.625rem",
    width: "100%",
    padding: "0.75rem 1rem",
    background: "#fff",
    color: "#374151",
    border: "0.0625rem solid #e5e7eb",
    borderRadius: "0.5rem",
    fontSize: "0.9375rem",
    fontWeight: 600,
    cursor: "pointer",
  },
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function GoogleSignInButton({
  nextPath = "/dashboard",
  showDivider = true,
  disabled = false,
  label = "Continue with Google",
}: {
  nextPath?: string;
  showDivider?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    try {
      await signIn("google", {
        callbackUrl: getGoogleAuthCallbackUrl(nextPath),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      toast.error(message);
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        style={{
          ...styles.button,
          opacity: disabled || loading ? 0.7 : 1,
          cursor: disabled || loading ? "not-allowed" : "pointer",
        }}
      >
        <GoogleIcon />
        {loading ? "Redirecting…" : label}
      </button>
      {showDivider && (
        <div style={styles.divider} aria-hidden="true">
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine} />
        </div>
      )}
    </>
  );
}
