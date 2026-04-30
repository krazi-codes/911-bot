"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  useConversationControls,
  useConversationStatus,
  useConversationMode,
  useConversationInput,
} from "@elevenlabs/react";
import styles from "./page.module.css";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "agent" | "user";
  text: string;
  timestamp: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Waveform Visualiser ────────────────────────────────────────────────────────

function Waveform({ active }: { active: boolean }) {
  return (
    <div className={styles.waveform} aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`${styles.waveBar} ${active ? styles.waveBarActive : ""}`}
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CallScreen() {
  const router = useRouter();
  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();
  const { isSpeaking } = useConversationMode();
  const { isMuted, setMuted } = useConversationInput();

  const [messages, setMessages] = useState<Message[]>([]);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email ?? "User");
      }
    };
    checkUser();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const formatElapsed = (secs: number) => {
    const m = String(Math.floor(secs / 60)).padStart(2, "0");
    const s = String(secs % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

  const appendMessage = useCallback((role: "agent" | "user", text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, role, text, timestamp: now() },
    ]);
  }, []);

  const saveConversation = useCallback(async (msgs: Message[]) => {
    if (msgs.length === 0) return;

    try {
      const transcript = msgs
        .map((m) => `[${m.timestamp}] ${m.role === "agent" ? "Agent" : "User"}: ${m.text}`)
        .join("\n");

      const { error } = await supabase.from("call_records").insert({
        original_text: transcript,
        translated_text: "Full conversation transcript saved.",
        language_code: "multi",
      });

      if (error) throw error;
      console.log("Conversation saved successfully");
    } catch (err) {
      console.error("Error saving conversation:", err);
    }
  }, []);

  const conversationIdRef = useRef<string | null>(null);

  // ── Session lifecycle ─────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    setSessionError(null);
    setIsConnecting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Use signed URL so the API key stays server-side
      const res = await fetch("/api/signed-url");
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${res.status}`);
      }
      const { signedUrl } = await res.json();

      await startSession({
        signedUrl,
        onConnect: (props: any) => {
          setIsConnecting(false);
          conversationIdRef.current = props.conversationId;
          console.log("Connected to ElevenLabs session:", props.conversationId);

          // Start timer
          timerRef.current = setInterval(
            () => setElapsedSecs((s) => s + 1),
            1000
          );
        },
        onDisconnect: () => {
          if (timerRef.current) clearInterval(timerRef.current);
          // Save when disconnected by agent/server
          setMessages((current) => {
            saveConversation(current);
            return current;
          });
        },
        onError: (err) => {
          setSessionError(
            typeof err === "string" ? err : (err as Error).message ?? "Unknown error"
          );
          setIsConnecting(false);
        },
        onMessage: (msg) => {
          let role: "agent" | "user" | null = null;
          let text: string | null = null;

          if (msg.source === "ai" && msg.message) {
            role = "agent";
            text = msg.message;
            appendMessage("agent", msg.message);
          } else if (msg.source === "user" && msg.message) {
            role = "user";
            text = msg.message;
            appendMessage("user", msg.message);
          }

          // Save live transcript for monitoring
          if (role && text && status === "connected") {
            supabase
              .from("live_transcripts")
              .insert({
                conversation_id: conversationIdRef.current || "web-session",
                role,
                text,
              })
              .then(({ error }) => {
                if (error) console.error("Live transcript error:", error);
              });
          }
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not start session";
      setSessionError(message);
      setIsConnecting(false);
    }
  }, [startSession, appendMessage, saveConversation]);

  const handleEnd = useCallback(async () => {
    // Save before ending
    await saveConversation(messages);
    
    await endSession();
    if (timerRef.current) clearInterval(timerRef.current);
    router.push("/dashboard");
  }, [endSession, router, messages, saveConversation]);

  // ── Auto-start on mount ───────────────────────────────────────────────────────

  useEffect(() => {
    const startTask = window.setTimeout(() => {
      handleStart();
    }, 0);

    return () => {
      window.clearTimeout(startTask);
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-scroll chat ──────────────────────────────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Derived state ─────────────────────────────────────────────────────────────

  const isConnected = status === "connected";
  const statusLabel = isConnecting
    ? "Connecting…"
    : isConnected
    ? `Call in Progress — ${formatElapsed(elapsedSecs)}`
    : "Disconnected";

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logoContainer} onClick={() => router.push("/dashboard")} style={{cursor: 'pointer'}}>
          <svg
            className={styles.logoIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 8 6 6" />
            <path d="m4 14 6-6 2-3" />
            <path d="M2 5h12" />
            <path d="M7 2h1" />
            <path d="m22 22-5-10-5 10" />
            <path d="M14 18h6" />
          </svg>
          <span className={styles.logoText}>PriorityLine</span>
        </div>

        {/* Mute toggle and User Avatar */}
        <div className={styles.headerRight}>
          <button
            id="mute-btn"
            className={`${styles.settingsBtn} ${isMuted ? styles.muted : ""}`}
            onClick={() => setMuted(!isMuted)}
            title={isMuted ? "Unmute" : "Mute"}
            disabled={!isConnected}
          >
            {isMuted ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          <div className={styles.avatarContainer} ref={dropdownRef}>
            <button 
              className={styles.avatarBtn} 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              aria-expanded={isDropdownOpen}
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
        {/* Caller info */}
        <div className={styles.callerInfo}>
          <h1 className={styles.callerName}>AI Translator</h1>
          <div className={styles.phone}>ElevenLabs Agent</div>
          <div className={styles.callStatusRow}>
            <span
              className={`${styles.statusDot} ${isConnected ? styles.statusDotActive : isConnecting ? styles.statusDotConnecting : ""}`}
            />
            <span className={styles.statusText}>{statusLabel}</span>
          </div>

          {/* Live waveform while agent speaks */}
          <Waveform active={isSpeaking && isConnected} />
        </div>

        {/* Error banner */}
        {sessionError && (
          <div className={styles.errorBanner} id="session-error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {sessionError}
            <button onClick={handleStart} className={styles.retryBtn}>Retry</button>
          </div>
        )}

        {/* Translation card */}
        <div className={styles.translationCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>LIVE TRANSLATION</span>
            <div className={styles.agentStatusPill}>
              <span className={`${styles.agentDot} ${isSpeaking ? styles.agentDotSpeaking : ""}`} />
              {isSpeaking ? "Agent speaking…" : isConnected ? "Listening" : "—"}
            </div>
          </div>

          <div className={styles.chatContainer} id="chat-container">
            {messages.length === 0 && (
              <div className={styles.emptyState}>
                {isConnecting
                  ? "Connecting to translator…"
                  : isConnected
                  ? "Conversation started. Speak now."
                  : "Session not started."}
              </div>
            )}

            {messages.map((msg) =>
              msg.role === "user" ? (
                <div key={msg.id} className={styles.messageGroupRight}>
                  <div className={styles.bubbleSourceRight}>{msg.text}</div>
                  <div className={styles.messageTimeRight}>{msg.timestamp}</div>
                </div>
              ) : (
                <div key={msg.id} className={styles.messageGroupLeft}>
                  <div className={styles.bubbleTargetLeft}>{msg.text}</div>
                  <div className={styles.messageTimeLeft}>{msg.timestamp}</div>
                </div>
              )
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* End Call */}
        <button
          id="end-call-btn"
          className={styles.endCallBtn}
          onClick={handleEnd}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
          End Call
        </button>

        {/* Reconnect button when disconnected without error */}
        {!isConnected && !isConnecting && !sessionError && (
          <button id="reconnect-btn" className={styles.reconnectBtn} onClick={handleStart}>
            Reconnect
          </button>
        )}
      </main>
    </div>
  );
}
