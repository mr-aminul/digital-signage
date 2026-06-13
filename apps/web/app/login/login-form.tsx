"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAppRouter } from "@/hooks/use-app-router";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { assets, getBackgroundStyle } from "@/lib/config/assets";
import { AuthBrandHeader } from "@/components/auth-brand-header";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

const AUTH_PANEL_CSS = `.auth-card input::placeholder { color: #9ca3af; }
.auth-right-panel { overflow: auto; scrollbar-width: none; -ms-overflow-style: none; }
.auth-right-panel::-webkit-scrollbar { display: none; }`;

const inputBase: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.75rem",
  background: "#f9fafb",
  border: "0.0625rem solid #e5e7eb",
  borderRadius: "0.5rem",
  fontSize: "0.875rem",
  color: "#111827",
  boxSizing: "border-box",
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: "fixed",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "flex",
    overflow: "hidden",
    background: "#e5e7eb",
    padding: "0.5rem",
    boxSizing: "border-box",
    borderRadius: "0.75rem",
  },
  leftPanel: {
    flex: 7,
    minWidth: 0,
    padding: "2.5rem 2rem",
    ...getBackgroundStyle(assets.loginBackgroundValue),
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "0.5rem",
    minHeight: 0,
    overflow: "hidden",
    borderRadius: "0.5rem",
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  leftTitle: {
    margin: 0,
    fontSize: "clamp(2rem, 4vw, 3.5rem)",
    fontWeight: 700,
    color: "#fff",
    lineHeight: 1.1,
  },
  leftSubtitle: {
    margin: 0,
    fontSize: "1.05rem",
    fontWeight: 400,
    color: "rgba(255,255,255,0.9)",
    lineHeight: 1.25,
  },
  rightPanel: {
    flex: 3,
    minWidth: 0,
    minHeight: 0,
    padding: "2.5rem 2rem",
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    overflow: "auto",
    borderRadius: "0.5rem",
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  authContent: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2.5rem",
  },
  brandMarkOffset: {
    transform: "translateY(-3rem)",
  },
  formStack: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  formTitle: {
    margin: "0 0 1rem",
    fontSize: "1.75rem",
    fontWeight: 800,
    color: "#111827",
    textAlign: "center",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  error: {
    padding: "0.5rem 0.75rem",
    background: "#fef2f2",
    color: "#b91c1c",
    borderRadius: "0.5rem",
    fontSize: "0.8125rem",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
  },
  fieldLabel: {
    fontSize: "0.875rem",
    fontWeight: 500,
    color: "#374151",
  },
  passwordFieldHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.75rem",
  },
  forgotLink: {
    fontSize: "0.8125rem",
    color: "#171717",
    fontWeight: 600,
    textDecoration: "underline",
    whiteSpace: "nowrap",
  },
  input: inputBase,
  inputPassword: { ...inputBase, paddingRight: "2.5rem" },
  passwordWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  eyeButton: {
    position: "absolute",
    right: "0.5rem",
    top: "50%",
    transform: "translateY(-50%)",
    padding: "0.25rem",
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  submitButton: {
    marginTop: "0.5rem",
    padding: "0.75rem 1rem",
    background: "#171717",
    color: "#fff",
    border: "none",
    borderRadius: "0.5rem",
    fontSize: "0.9375rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  footer: {
    margin: "1.5rem 0 0",
    fontSize: "0.8125rem",
    color: "#6b7280",
  },
  footerLink: {
    color: "#171717",
    fontWeight: 700,
    textDecoration: "underline",
  },
};

export function LoginForm() {
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const authError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        const message =
          signInError.message === "Invalid login credentials"
            ? "Email or password is incorrect. If you recently reset your password, use the new one."
            : signInError.message;
        setError(message);
        toast.error(message);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message.includes("Missing Supabase")
            ? "App is not configured for sign-in. Contact your administrator."
            : err.message
          : "Sign-in failed";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card auth-card--login" style={styles.wrapper}>
      <style>{AUTH_PANEL_CSS}</style>
      <div className="auth-left-panel" style={styles.leftPanel}>
        <h1 style={styles.leftTitle}>Welcome back</h1>
        <p style={styles.leftSubtitle}>Sign in to manage screens, playlists, and media.</p>
      </div>
      <div className="auth-right-panel" style={styles.rightPanel}>
        <div className="auth-content" style={styles.authContent}>
          <div className="auth-brand-offset" style={styles.brandMarkOffset}>
            <AuthBrandHeader variant="hero-light" />
          </div>
          <div style={styles.formStack}>
            <h2 style={styles.formTitle}>Login</h2>
            <GoogleSignInButton nextPath={next} disabled={loading} />
            <form onSubmit={onSubmit} style={styles.form}>
              {authError === "auth_confirm_failed" && (
                <div style={styles.error} role="alert">
                  That sign-in link is invalid or has expired. Try resetting your password again.
                </div>
              )}
              {authError === "google_auth_failed" && (
                <div style={styles.error} role="alert">
                  Google sign-in was cancelled or failed. Please try again.
                </div>
              )}
              {authError === "google_bridge_failed" && (
                <div style={styles.error} role="alert">
                  Google sign-in succeeded but your console session could not be started. Check server
                  configuration or contact your administrator.
                </div>
              )}
              {authError === "Configuration" && (
                <div style={styles.error} role="alert">
                  Google sign-in is not configured yet. Set AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, and
                  AUTH_SECRET.
                </div>
              )}
              {error && (
                <div style={styles.error} role="alert">
                  {error}
                </div>
              )}
              <label style={styles.field}>
                <span style={styles.fieldLabel}>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  style={styles.input}
                />
              </label>
              <label style={styles.field}>
                <div style={styles.passwordFieldHeader}>
                  <span style={styles.fieldLabel}>Password</span>
                  <Link
                    href={
                      email.trim()
                        ? `/forgot-password?email=${encodeURIComponent(email.trim())}`
                        : "/forgot-password"
                    }
                    style={styles.forgotLink}
                  >
                    Forgot password?
                  </Link>
                </div>
                <div style={styles.passwordWrap}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    style={styles.inputPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    style={styles.eyeButton}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff size={18} color="#6b7280" strokeWidth={1.75} />
                    ) : (
                      <Eye size={18} color="#6b7280" strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </label>
              <button type="submit" disabled={loading} style={styles.submitButton}>
                {loading ? "Signing in…" : "Login"}
              </button>
            </form>
            <p style={styles.footer}>
              Don&apos;t have an account?{" "}
              <Link href="/signup" style={styles.footerLink}>
                Sign Up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
