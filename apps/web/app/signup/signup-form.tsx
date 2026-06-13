"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAppRouter } from "@/hooks/use-app-router";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSignupConfirmRedirectUrl } from "@/lib/auth/app-url";
import { DEFAULT_TRIAL_DAYS } from "@/lib/plan-quota";
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
  formHint: {
    margin: "-0.5rem 0 1rem",
    fontSize: "0.8125rem",
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 1.4,
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
  success: {
    padding: "0.75rem 0.875rem",
    background: "#ecfdf5",
    color: "#047857",
    borderRadius: "0.5rem",
    fontSize: "0.8125rem",
    lineHeight: 1.45,
    textAlign: "center",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
  },
  fieldLabel: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#374151",
  },
  fieldOptional: {
    fontWeight: 400,
    color: "#9ca3af",
  },
  input: inputBase,
  inputPassword: { ...inputBase, paddingRight: "2.5rem" },
  passwordWrap: { position: "relative", width: "100%" },
  eyeButton: {
    position: "absolute",
    right: "0.625rem",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "0.25rem",
    display: "flex",
    alignItems: "center",
  },
  submitButton: {
    width: "100%",
    padding: "0.75rem 1rem",
    background: assets.themePrimary,
    color: assets.themePrimaryContrast,
    border: "none",
    borderRadius: "0.5rem",
    fontSize: "0.9375rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  footer: {
    margin: 0,
    fontSize: "0.8125rem",
    color: "#6b7280",
    textAlign: "center",
  },
  footerLink: {
    background: "none",
    border: "none",
    padding: 0,
    color: assets.themePrimary,
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "inherit",
  },
};

type SignupView = "form" | "check-email";

export function SignupForm() {
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [view, setView] = useState<SignupView>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: getSignupConfirmRedirectUrl(),
          data: {
            full_name: companyName.trim() || undefined,
          },
        },
      });

      if (signUpError) {
        const message =
          signUpError.message.toLowerCase().includes("already registered")
            ? "An account already exists for this email. Try signing in instead."
            : signUpError.message;
        setError(message);
        toast.error(message);
        return;
      }

      setView("check-email");
      toast.success("Check your email to confirm your account");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-up failed";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card auth-card--signup" style={styles.wrapper}>
      <style>{AUTH_PANEL_CSS}</style>
      <div className="auth-left-panel" style={styles.leftPanel}>
        <h1 style={styles.leftTitle}>
          {view === "form" ? "Start your free trial" : "Almost there"}
        </h1>
        <p style={styles.leftSubtitle}>
          {view === "form"
            ? `${DEFAULT_TRIAL_DAYS} days free · 1 screen included · no credit card`
            : "Confirm your email to open your OneSign console."}
        </p>
      </div>
      <div className="auth-right-panel" style={styles.rightPanel}>
        <div className="auth-content" style={styles.authContent}>
          <div className="auth-brand-offset" style={styles.brandMarkOffset}>
            <AuthBrandHeader variant="hero-light" />
          </div>
          <div style={styles.formStack}>
            {view === "form" ? (
              <>
                <h2 style={styles.formTitle}>Create account</h2>
                <p style={styles.formHint}>
                  Sign up with Google or email. You&apos;ll get one screen for {DEFAULT_TRIAL_DAYS} days.
                </p>
                <GoogleSignInButton nextPath={next} disabled={loading} label="Sign up with Google" />
                <form onSubmit={onSubmit} style={styles.form}>
                  {error && (
                    <div style={styles.error} role="alert">
                      {error}
                    </div>
                  )}
                  <label style={styles.field}>
                    <span style={styles.fieldLabel}>
                      Company name <span style={styles.fieldOptional}>(optional)</span>
                    </span>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Your business"
                      autoComplete="organization"
                      style={styles.input}
                    />
                  </label>
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
                    <span style={styles.fieldLabel}>Password</span>
                    <div style={styles.passwordWrap}>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        required
                        minLength={8}
                        autoComplete="new-password"
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
                    {loading ? "Creating account…" : "Create account"}
                  </button>
                </form>
                <p style={styles.footer}>
                  Already have an account?{" "}
                  <Link href="/login" style={{ color: assets.themePrimary, fontWeight: 600 }}>
                    Sign in
                  </Link>
                </p>
              </>
            ) : (
              <>
                <h2 style={styles.formTitle}>Check your email</h2>
                <div style={styles.success} role="status">
                  We sent a confirmation link to <strong>{email.trim()}</strong>. Click it to start
                  your {DEFAULT_TRIAL_DAYS}-day trial.
                </div>
                <p style={styles.footer}>
                  <Link href="/login" style={{ color: assets.themePrimary, fontWeight: 600 }}>
                    Back to sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
