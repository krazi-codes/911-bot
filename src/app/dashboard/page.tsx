"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
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

type PreviewTurn = {
  role: string;
  message: string;
};

function extractTranscriptTurns(text: string | null): PreviewTurn[] {
  if (!text) return [];
  const trimmed = text.trim();
  const turns: PreviewTurn[] = [];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      parsed.forEach((item) => {
        if (
          item &&
          typeof item === "object" &&
          "role" in item &&
          "message" in item &&
          typeof (item as { role?: unknown }).role === "string" &&
          typeof (item as { message?: unknown }).message === "string"
        ) {
          const message = (item as { message: string }).message.trim();
          if (!message) return;
          turns.push({
            role: (item as { role: string }).role,
            message,
          });
        }
      });
    }
  } catch {
    // Fall back to regex extraction for non-JSON payloads.
  }

  if (turns.length > 0) return turns;

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

function formatPreviewText(record: CallRecord): PreviewTurn[] {
  const source = record.translated_text || record.original_text || "No transcript saved.";
  const parsedTurns = extractTranscriptTurns(source);
  if (parsedTurns.length > 0) {
    return parsedTurns.slice(0, 2).map((turn) => ({
      role: turn.role.toLowerCase() === "agent" ? "Agent" : "Caller",
      message: turn.message.replace(/\s+/g, " ").trim(),
    }));
  }

  return [{ role: "Transcript", message: source.replace(/\s+/g, " ").trim() }];
}

function CallHistory({ history }: { history: CallRecord[] }) {
  if (history.length === 0) {
    return <p className={styles.emptyHistory}>No recent conversations found.</p>;
  }

  return (
    <div className={styles.historyList}>
      {history.map((record) => (
        <Link
          key={record.id}
          href={`/dashboard/calls/${record.id}`}
          className={styles.historyCard}
        >
          <div className={styles.cardInfo}>
            <div className={styles.cardMeta}>
              <span className={styles.cardTime}>
                {new Date(record.created_at).toLocaleString()}
              </span>
              <span className={styles.cardLanguage}>
                {record.language_name || record.language_code || "Unknown"}
              </span>
            </div>
            <div className={styles.cardTranscript}>
              {formatPreviewText(record).map((turn, index) => (
                <p key={`${record.id}-preview-${index}`} className={styles.cardTranscriptLine}>
                  <span className={styles.cardTranscriptRole}>{turn.role}:</span> {turn.message}
                </p>
              ))}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [history, setHistory] = useState<CallRecord[]>([]);
  const [incomingCall, setIncomingCall] = useState<any | null>(null);
  const todayLabel = new Date().toDateString();
  const callsToday = history.filter(
    (record) => new Date(record.created_at).toDateString() === todayLabel
  ).length;
  const latestLanguage = history[0]?.language_code || "None";

  useEffect(() => {
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setUserEmail(session.user.email ?? "User");
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        router.push("/");
      }
    });

    // Initial check
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email ?? "User");
        setLoading(false);
        fetchHistory();
      } else {
        const timeout = setTimeout(async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            router.push("/");
          } else {
            setUserEmail(session.user.email ?? "User");
            setLoading(false);
            fetchHistory();
          }
        }, 1500);
        return () => clearTimeout(timeout);
      }
    };

    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from("call_records")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(6);
      
      if (!error && data) {
        setHistory(data);
      }
    };

    checkUser();

    // ── Supabase Realtime for Incoming Calls ───────────────────────────────────
    
    const callsChannel = supabase
      .channel('incoming-calls')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'active_calls' },
        (payload) => {
          console.log('New incoming call:', payload);
          setIncomingCall(payload.new);
          
          // Play a sound if possible
          try {
            const audio = new Audio('/ringtone.mp3'); // User needs to provide this or use a beep
            audio.play().catch(() => {});
          } catch (e) {}
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'active_calls' },
        (payload) => {
          if (payload.new.status === 'ended') {
            setIncomingCall(null);
          }
        }
      )
      .subscribe();

    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(callsChannel);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.mainContent}>
          <div className={styles.phoneIconContainer}>
            <div className={styles.translateDots}>
              <span className={styles.dot}></span>
              <span className={styles.dot}></span>
              <span className={styles.dot}></span>
            </div>
          </div>
          <h1 className={styles.title}>Verifying session...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logoContainer}>
          <svg className={styles.logoIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
          </svg>
          <span className={styles.logoText}>Rescue Remix</span>
        </div>

        <div className={styles.headerActions}>
          <Link href="/monitor" className={styles.monitorLink}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Live Monitor
          </Link>
          
          <div className={styles.avatarContainer} ref={dropdownRef}>
          <button 
            className={styles.avatarBtn} 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            aria-expanded={isDropdownOpen}
            aria-haspopup="true"
          >
            <div className={styles.avatar}>
              <Image src="/abstract_bg.png" alt="User Avatar" width={40} height={40} style={{objectFit: 'cover'}} />
            </div>
          </button>

          {isDropdownOpen && (
              <div className={styles.dropdownMenu}>
                <div className={styles.dropdownHeader}>
                  <span className={styles.dropdownUsername}>{userEmail}</span>
                </div>
                <div className={styles.dropdownDivider}></div>
                <Link href="/admin" className={styles.dropdownItemPrimary}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="21" x2="9" y2="9"></line>
                  </svg>
                  Admin Analytics
                </Link>
                <button className={styles.dropdownItem} onClick={handleLogout}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  Logout
                </button>
              </div>
          )}
        </div>
      </div>
    </header>

      <main className={styles.mainContent}>
        {/* Incoming Call Modal Overlay */}
        {incomingCall && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
              <div className={styles.ringingAnim}>
                <div className={styles.ringCircle}></div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <h2 className={styles.modalTitle}>Incoming Call</h2>
              <p className={styles.modalSubtitle}>From: {incomingCall.caller_number || "Unknown Number"}</p>
              <div className={styles.modalActions}>
                <button 
                  className={styles.declineBtn}
                  onClick={() => setIncomingCall(null)}
                >
                  Decline
                </button>
                <Link 
                  href={`/call?id=${incomingCall.conversation_id}`}
                  className={styles.acceptBtn}
                  onClick={() => setIncomingCall(null)}
                >
                  Accept
                </Link>
              </div>
            </div>
          </div>
        )}
        <section className={styles.hero}>
          <div>
            <div className={styles.statusInline}>
              Dispatch line active
            </div>
            <h1 className={styles.title}>Emergency call workspace</h1>
            <p className={styles.subtitle}>
              Answer incoming callers, review recent transcripts, and hand off clear notes to the next responder.
            </p>
          </div>

          <div className={styles.actionButtons}>
            <Link href="/incoming" className={styles.translateCallBtn}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
              </svg>
              Translate Call
            </Link>
            <Link href="/incoming" className={styles.normalCallBtn}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Normal Call
            </Link>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Latest 6 records</span>
            <strong>{history.length}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Today</span>
            <strong>{callsToday}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Latest language</span>
            <strong>{latestLanguage}</strong>
          </div>
        </section>

        {/* Recent Activity Section */}
        <div className={styles.historySection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent activity</h2>
            <div className={styles.sectionActions}>
              <span>{history.length ? "Click a record to review it" : "No saved calls yet"}</span>
              <Link href="/dashboard/calls" className={styles.viewAllLink}>
                View all records
              </Link>
            </div>
          </div>
          <CallHistory history={history} />
        </div>

      </main>
    </div>
  );
}
