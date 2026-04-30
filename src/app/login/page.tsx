"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "An unexpected error occurred";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (authError) throw authError;
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError(authError.message);
      } else {
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.badge}>Dispatcher Access</p>
        <h1>Sign in</h1>
        <p className={styles.subtext}>Continue to the emergency operations workspace.</p>

        <form onSubmit={handleLogin} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={styles.input}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={styles.input}
          />
          <button type="submit" disabled={loading} className={styles.primary}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <button type="button" onClick={handleGoogleLogin} className={styles.secondary}>
          Continue with Google
        </button>

        <p className={styles.footer}>
          New here? <Link href="/register">Create account</Link>
        </p>
      </div>
    </main>
  );
}
