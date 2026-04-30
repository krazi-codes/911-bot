"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type CallRecord = {
  id: string;
  created_at: string;
  original_text: string | null;
  translated_text: string | null;
  language_code: string | null;
  language_name?: string | null;
};

type TranscriptTurn = {
  role: string;
  message: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normalizeTranscript(text: string | null, fallback: string) {
  if (!text) return fallback;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return normalized || fallback;
}

function parseTranscriptTurns(text: string | null): TranscriptTurn[] {
  if (!text) return [];
  const trimmed = text.trim();

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const turns = parsed
        .map((item): TranscriptTurn | null => {
          if (!item || typeof item !== "object") return null;
          const maybeRole = (item as { role?: unknown }).role;
          const maybeMessage = (item as { message?: unknown }).message;
          if (typeof maybeRole !== "string" || typeof maybeMessage !== "string") return null;
          const message = maybeMessage.trim();
          if (!message) return null;
          return { role: maybeRole, message };
        })
        .filter((item): item is TranscriptTurn => item !== null);

      if (turns.length > 0) {
        return turns;
      }
    }
  } catch {
    // Fall back to regex extraction for non-JSON payloads.
  }

  const turns: TranscriptTurn[] = [];
  const singleQuoteRegex = /'role'\s*:\s*'([^']+)'[\s\S]*?'message'\s*:\s*'([^']*)'/g;
  let singleQuoteMatch = singleQuoteRegex.exec(trimmed);
  while (singleQuoteMatch) {
    const role = singleQuoteMatch[1]?.trim();
    const message = singleQuoteMatch[2]?.trim();
    if (role && message) turns.push({ role, message });
    singleQuoteMatch = singleQuoteRegex.exec(trimmed);
  }

  if (turns.length > 0) return turns;

  const doubleQuoteRegex = /"role"\s*:\s*"([^"]+)"[\s\S]*?"message"\s*:\s*"([^"]*)"/g;
  let doubleQuoteMatch = doubleQuoteRegex.exec(trimmed);
  while (doubleQuoteMatch) {
    const role = doubleQuoteMatch[1]?.trim();
    const message = doubleQuoteMatch[2]?.trim();
    if (role && message) turns.push({ role, message });
    doubleQuoteMatch = doubleQuoteRegex.exec(trimmed);
  }

  return turns;
}

function TranscriptContent({
  text,
  fallback,
  variant,
}: {
  text: string | null;
  fallback: string;
  variant: "original" | "translated";
}) {
  const turns = parseTranscriptTurns(text);
  if (turns.length === 0) {
    return <pre className={styles.transcript}>{normalizeTranscript(text, fallback)}</pre>;
  }

  const turnsClassName =
    variant === "original"
      ? `${styles.transcriptTurns} ${styles.transcriptTurnsOriginal}`
      : `${styles.transcriptTurns} ${styles.transcriptTurnsTranslated}`;

  return (
    <div className={turnsClassName}>
      {turns.map((turn, index) => {
        const isAgent = turn.role.toLowerCase() === "agent";
        const roleLabel = isAgent ? "Agent" : "Caller";
        return (
          <div
            key={`${turn.role}-${index}-${turn.message.slice(0, 12)}`}
            className={`${styles.turn} ${isAgent ? styles.turnAgent : styles.turnUser}`}
          >
            <div className={styles.turnHeader}>
              <span className={styles.turnRole}>{roleLabel}</span>
            </div>
            <p className={styles.turnMessage}>{turn.message}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function CallDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<CallRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadRecord = async () => {
      setLoading(true);
      setError(null);
      const recordId = typeof params.id === "string" ? params.id : "";
      if (!recordId) {
        setError("Invalid call record identifier.");
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/");
        return;
      }

      const { data, error } = await supabase
        .from("call_records")
        .select("*")
        .eq("id", recordId)
        .single();

      if (!active) return;

      if (error) {
        setError(error.message);
        setRecord(null);
      } else {
        setRecord(data as CallRecord);
      }

      setLoading(false);
    };

    loadRecord();

    return () => {
      active = false;
    };
  }, [params.id, router]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.backLink}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Dashboard
        </Link>
        <div className={styles.logo}>Rescue Remix</div>
      </header>

      <main className={styles.main}>
        {loading && <div className={styles.panel}>Loading call record...</div>}

        {!loading && error && (
          <div className={styles.panel}>
            <p className={styles.errorText}>{error}</p>
          </div>
        )}

        {!loading && !error && !record && (
          <div className={styles.panel}>Call record not found.</div>
        )}

        {record && (
          <>
            <section className={styles.summary}>
              <div>
                <p className={styles.eyebrow}>Call Record</p>
                <h1 className={styles.title}>{formatDate(record.created_at)}</h1>
                <div className={styles.metaRow}>
                  <span className={styles.metaItem}>ID: {record.id}</span>
                  <span className={styles.metaItem}>Type: Emergency call</span>
                </div>
              </div>
              <div className={styles.languagePill}>
                {record.language_name || record.language_code || "Unknown language"}
              </div>
            </section>

            <section className={styles.grid}>
              <article className={`${styles.transcriptPanel} ${styles.transcriptPanelOriginal}`}>
                <div className={styles.panelHeader}>
                  <h2>Original Transcript</h2>
                  <p>Live conversation turns captured during the call.</p>
                </div>
                <TranscriptContent
                  text={record.original_text}
                  fallback="No original transcript was saved."
                  variant="original"
                />
              </article>

              <article className={`${styles.transcriptPanel} ${styles.transcriptPanelTranslated}`}>
                <div className={styles.panelHeader}>
                  <h2>Translation / Notes</h2>
                  <p>Interpretation stream and notes captured for review.</p>
                </div>
                <TranscriptContent
                  text={record.translated_text}
                  fallback="No translated transcript was saved."
                  variant="translated"
                />
              </article>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
