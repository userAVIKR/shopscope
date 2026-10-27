"use client";

import {
  ArrowRight,
  Check,
  CircleAlert,
  Code2,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Mail,
  MessageSquareText,
  ShieldCheck,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/services/api-client";
import { getHealth } from "@/services/query-service";
import styles from "./login.module.css";

type Mode = "login" | "register";
type Field = "name" | "email" | "password";
type ServerStatus = "checking" | "ready" | "ai-offline" | "offline";

const MIN_PASSWORD = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COPY = {
  login: {
    step: "01 / Sign in",
    title: "Return to your",
    highlight: "numbers.",
    intro: "Sign in to ask questions about your sales data and pick up where you left off.",
    submit: "Sign in",
    busy: "Signing in…",
  },
  register: {
    step: "02 / Create account",
    title: "Start asking your",
    highlight: "data.",
    intro: "Create an account to ask about revenue, orders and customers in plain English.",
    submit: "Create account",
    busy: "Creating account…",
  },
} as const;

const FEATURES = [
  { icon: MessageSquareText, title: "Ask in plain English", text: "Questions become charts in seconds" },
  { icon: Code2, title: "See the SQL", text: "Every answer shows its query" },
  { icon: ShieldCheck, title: "Read-only by design", text: "Validated, and runs on your machine" },
];

const STATUS_LABEL: Record<ServerStatus, string> = {
  checking: "Checking server…",
  ready: "Server ready",
  "ai-offline": "AI model offline",
  offline: "Server unreachable",
};

function validate(mode: Mode, values: Record<Field, string>): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (mode === "register" && !values.name.trim()) errors.name = "Enter your name.";
  if (!values.email.trim()) errors.email = "Enter your email address.";
  else if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = "That doesn't look like an email address.";
  if (!values.password) errors.password = "Enter your password.";
  else if (mode === "register" && values.password.length < MIN_PASSWORD) {
    errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  }
  return errors;
}

export default function LoginPage() {
  const { status, login, register } = useAuth();
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("login");
  const [values, setValues] = useState<Record<Field, string>>({ name: "", email: "", password: "" });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [server, setServer] = useState<ServerStatus>("checking");

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  // Tell people up front if signing in cannot work, instead of after they type everything.
  useEffect(() => {
    void getHealth().then((health) => {
      if (!health) setServer("offline");
      else if (health.checks.appDatabase !== "up") setServer("offline");
      else setServer(health.checks.ollama === "up" ? "ready" : "ai-offline");
    });
  }, []);

  const copy = COPY[mode];
  const errors = validate(mode, values);
  const visibleError = (field: Field) => (touched[field] ? errors[field] : undefined);
  const passwordLongEnough = values.password.length >= MIN_PASSWORD;

  function update(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFormError(null);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setTouched({});
    setFormError(null);
    // The email is kept, so switching tabs never loses what was typed.
    setValues((current) => ({ ...current, password: "" }));
    emailRef.current?.focus();
  }

  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched({ name: true, email: true, password: true });
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setFormError(null);
    try {
      if (mode === "login") await login(values.email.trim(), values.password);
      else await register(values.name.trim(), values.email.trim(), values.password);
      router.replace("/");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setValues((current) => ({ ...current, password: "" }));
      setTouched((current) => ({ ...current, password: false }));
    } finally {
      setSubmitting(false);
    }
  }

  const fieldProps = (field: Field) => ({
    id: field,
    value: values[field],
    onChange: (e: { target: { value: string } }) => update(field, e.target.value),
    onBlur: () => setTouched((current) => ({ ...current, [field]: true })),
    "aria-invalid": visibleError(field) ? true : undefined,
    "aria-describedby": visibleError(field) ? `${field}-error` : undefined,
  });

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>s/</span>
          <span className={styles.brandName}>ShopScope</span>
        </div>
        <span className={styles.serverStatus} data-status={server} role="status">
          <span className={styles.serverDot} aria-hidden="true" />
          {STATUS_LABEL[server]}
        </span>
      </header>

      <main className={styles.main}>
        <section className={styles.card} aria-labelledby="auth-title">
          <p className={styles.step}>
            <span className={styles.stepLine} />
            {copy.step}
          </p>
          <h1 id="auth-title" className={styles.title}>
            {copy.title} <em>{copy.highlight}</em>
          </h1>
          <p className={styles.intro}>{copy.intro}</p>

          <div className={styles.tabs} role="tablist" aria-label="Account">
            {(["login", "register"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={mode === tab}
                className={styles.tab}
                onClick={() => switchMode(tab)}
              >
                {tab === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {server === "offline" && (
            <p className={styles.notice} role="alert">
              <CircleAlert size={16} /> The ShopScope server isn&apos;t responding. Make sure the backend is running, then refresh.
            </p>
          )}

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            {mode === "register" && (
              <div className={styles.field}>
                <label htmlFor="name" className={styles.label}>
                  Full name
                </label>
                <div className={styles.inputWrap}>
                  <User size={16} className={styles.inputIcon} aria-hidden="true" />
                  <input {...fieldProps("name")} className={styles.input} type="text" autoComplete="name" placeholder="Your name" maxLength={100} />
                </div>
                {visibleError("name") && (
                  <p id="name-error" className={styles.fieldError}>
                    {visibleError("name")}
                  </p>
                )}
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>
                Email address
              </label>
              <div className={styles.inputWrap}>
                <Mail size={16} className={styles.inputIcon} aria-hidden="true" />
                <input
                  {...fieldProps("email")}
                  ref={emailRef}
                  className={styles.input}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  maxLength={254}
                  autoFocus
                />
              </div>
              {visibleError("email") && (
                <p id="email-error" className={styles.fieldError}>
                  {visibleError("email")}
                </p>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="password" className={styles.label}>
                Password
              </label>
              <div className={styles.inputWrap}>
                <Lock size={16} className={styles.inputIcon} aria-hidden="true" />
                <input
                  {...fieldProps("password")}
                  className={styles.input}
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder={mode === "login" ? "Enter your password" : `At least ${MIN_PASSWORD} characters`}
                  maxLength={128}
                  onKeyDown={trackCapsLock}
                  onKeyUp={trackCapsLock}
                />
                <button
                  type="button"
                  className={styles.reveal}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {capsLock && <p className={styles.hint}>Caps Lock is on.</p>}
              {mode === "register" ? (
                <p
                  id="password-error"
                  className={styles.requirement}
                  data-met={passwordLongEnough || undefined}
                  data-error={(!passwordLongEnough && touched.password) || undefined}
                >
                  {passwordLongEnough ? <Check size={13} /> : <CircleAlert size={13} />} At least {MIN_PASSWORD} characters
                </p>
              ) : (
                visibleError("password") && (
                  <p id="password-error" className={styles.fieldError}>
                    {visibleError("password")}
                  </p>
                )
              )}
            </div>

            {formError && (
              <p className={styles.formError} role="alert">
                <CircleAlert size={16} /> {formError}
              </p>
            )}

            <button className={styles.submit} type="submit" disabled={submitting || server === "offline"}>
              {submitting ? <LoaderCircle size={16} className={styles.spin} /> : null}
              <span>{submitting ? copy.busy : copy.submit}</span>
              {!submitting && <ArrowRight size={16} />}
            </button>
          </form>

          <p className={styles.legal}>
            {mode === "login" ? "New here? " : "Already registered? "}
            <button type="button" className={styles.inlineLink} onClick={() => switchMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "Create an account" : "Sign in instead"}
            </button>
          </p>
        </section>

        <ul className={styles.features} aria-label="What ShopScope does">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className={styles.feature}>
              <span className={styles.featureIcon}>
                <Icon size={16} />
              </span>
              <div>
                <h2>{title}</h2>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
