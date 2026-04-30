"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

const PAGE_SIZE = 20;

function previewText(record: CallRecord): string {
  const text = record.translated_text || record.original_text || "";
  return text.replace(/\s+/g, " ").trim() || "No transcript saved.";
}

export default function CallRecordsPage() {
  const router = useRouter();
  const [records, setRecords] = useState<CallRecord[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadPage = async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/");
        return;
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE;

      const { data, error: queryError } = await supabase
        .from("call_records")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (!active) return;

      if (queryError) {
        setError(queryError.message);
        setRecords([]);
        setHasNextPage(false);
      } else {
        const rows = (data || []) as CallRecord[];
        setRecords(rows.slice(0, PAGE_SIZE));
        setHasNextPage(rows.length > PAGE_SIZE);
      }

      setLoading(false);
    };

    loadPage();

    return () => {
      active = false;
    };
  }, [page, router]);

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
        <h1 className={styles.title}>All call records</h1>
      </header>

      <main className={styles.main}>
        {loading && <p className={styles.notice}>Loading records...</p>}
        {!loading && error && <p className={styles.noticeError}>{error}</p>}
        {!loading && !error && records.length === 0 && (
          <p className={styles.notice}>No call records found.</p>
        )}

        {!loading && !error && records.length > 0 && (
          <>
            <div className={styles.list}>
              {records.map((record) => (
                <Link key={record.id} href={`/dashboard/calls/${record.id}`} className={styles.card}>
                  <div className={styles.meta}>
                    <span>{new Date(record.created_at).toLocaleString()}</span>
                    <span className={styles.lang}>
                      {record.language_name || record.language_code || "Unknown"}
                    </span>
                  </div>
                  <p className={styles.preview}>{previewText(record)}</p>
                </Link>
              ))}
            </div>

            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </button>
              <span className={styles.pageLabel}>Page {page + 1}</span>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNextPage}
              >
                Next
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
