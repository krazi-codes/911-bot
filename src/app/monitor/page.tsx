"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

interface Message {
  id: string;
  role: "agent" | "user";
  text: string;
  created_at: string;
}

interface ActiveCall {
  id: string;
  conversation_id: string;
  caller_number: string;
  status: string;
  created_at: string;
}

export default function MonitorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const conversationId = searchParams.get("id");
  
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(conversationId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // 1. Fetch all conversations from ElevenLabs API
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        setLoadError(null);
        const res = await fetch("/api/conversations");
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          const errorMessage =
            payload?.error ?? `Failed to fetch conversations (${res.status})`;
          if (res.status === 429) {
            setLoadError(
              "Rate limited by ElevenLabs. Retrying automatically in a few seconds."
            );
            return;
          }
          throw new Error(errorMessage);
        }
        const data = await res.json();
        
        // Map and show latest 10 conversations regardless of status
        if (data.conversations) {
          const mapped: ActiveCall[] = data.conversations
            .slice(0, 10) // Only show latest 10
            .map((c: any) => {
              // Try to find ANY field that looks like a phone number
              let phoneNumber = null;
              
              // 1. Check top-level user_id (common for phone calls)
              if (c.user_id && (c.user_id.startsWith('+') || /^\d{10,}$/.test(c.user_id.replace(/\s/g, '')))) {
                phoneNumber = c.user_id;
              }
              
              // 2. Check nested phone_call metadata
              if (!phoneNumber) {
                phoneNumber = c.metadata?.phone_call?.external_number || c.metadata?.phone_call?.caller_number;
              }

              // 3. Check known metadata fields
              if (!phoneNumber) {
                const possibleFields = ['caller_id', 'phone_number', 'caller_number', 'from_number', 'to_number', 'number'];
                for (const field of possibleFields) {
                  if (c.metadata?.[field]) {
                    phoneNumber = c.metadata[field];
                    break;
                  }
                }
              }
              
              // 4. Check initiation client data (dynamic variables)
              if (!phoneNumber) {
                phoneNumber = c.conversation_initiation_client_data?.dynamic_variables?.system__caller_id;
              }
              
              // 5. If still not found, check ALL metadata values (even nested)
              if (!phoneNumber && c.metadata) {
                const checkObject = (obj: any): string | null => {
                  for (const key in obj) {
                    const val = obj[key];
                    if (typeof val === 'string' && (val.startsWith('+') || /^\d{10,}$/.test(val.replace(/\s/g, '')))) {
                      return val;
                    } else if (typeof val === 'object' && val !== null) {
                      const found = checkObject(val);
                      if (found) return found;
                    }
                  }
                  return null;
                };
                phoneNumber = checkObject(c.metadata);
              }
                
              const callerDisplay = phoneNumber ? phoneNumber : "Web";
              return {
                id: c.conversation_id,
                conversation_id: c.conversation_id,
                caller_number: `Agent / ${callerDisplay}`,
                status: c.status,
                created_at: new Date(c.start_time_unix_secs * 1000).toISOString(),
              };
            });
          
          setActiveCalls(mapped);
          
          if (!selectedCallId && mapped.length > 0) {
            setSelectedCallId(mapped[0].conversation_id);
          }
        }
      } catch (err) {
        console.error("Error fetching ElevenLabs list:", err);
        const message =
          err instanceof Error ? err.message : "Failed to fetch conversations";
        setLoadError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
    // Poll for the list every 10 seconds
    const interval = setInterval(fetchConversations, 10000);

    // User authentication check
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email ?? "Supervisor");
      }
    };
    checkUser();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      clearInterval(interval);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedCallId]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  // 2. Poll for transcripts for selected call from ElevenLabs
  useEffect(() => {
    if (!selectedCallId) {
      setMessages([]);
      return;
    }

    // Reset messages when switching calls to show loading state
    setMessages([]);

    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/conversations/${selectedCallId}`);
        if (!res.ok) return;
        const data = await res.json();
        
        console.log("Transcript data for", selectedCallId, data);

        if (data.transcript) {
          const mappedMsgs: Message[] = data.transcript
            .map((t: any, idx: number) => ({
              id: `${selectedCallId}-${idx}`,
              role: t.role === "agent" ? "agent" : "user",
              text: (t.message || t.text || "").trim(), // Check for both message and text
              created_at: new Date().toISOString(),
            }))
            .filter((msg: Message) => msg.text.length > 0); // Remove empty bubbles
          setMessages(mappedMsgs);
        }
      } catch (err) {
        console.error("Error polling transcript:", err);
      }
    };

    fetchDetail();
    // Poll for transcript every 2 seconds for a faster "real-time" feel
    const interval = setInterval(fetchDetail, 2000);
    return () => clearInterval(interval);
  }, [selectedCallId]);

  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (!chatContainer) return;
    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logoContainer} onClick={() => router.push("/dashboard")} style={{cursor: 'pointer'}}>
          <svg className={styles.logoIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
          </svg>
          <span className={styles.logoText}>Rescue Remix Monitor</span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statusBadge}>
            <span className={`${styles.statusDot} ${activeCalls.length > 0 ? styles.live : ""}`} />
            {activeCalls.length} ACTIVE {activeCalls.length === 1 ? "CALL" : "CALLS"}
          </div>

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

      <main className={styles.monitorLayout}>
        {/* Sidebar: Active Conversations List */}
        <aside className={styles.sidebar}>
          <h2 className={styles.sidebarTitle}>Active Conversations</h2>
          <div className={styles.callList}>
            {loadError && (
              <div className={styles.emptySidebar}>{loadError}</div>
            )}
            {activeCalls.length === 0 && !loading && (
              <div className={styles.emptySidebar}>No active calls</div>
            )}
            {activeCalls.map((call) => (
              <div 
                key={call.id} 
                className={`${styles.callItem} ${selectedCallId === call.conversation_id ? styles.activeItem : ""}`}
                onClick={() => setSelectedCallId(call.conversation_id)}
              >
                <div className={styles.callItemHeader}>
                  <span className={`${styles.callStatus} ${call.status === 'in-progress' ? styles.statusLive : styles.statusDone}`}>
                    {call.status.toUpperCase()}
                  </span>
                  <span className={styles.callTime}>{new Date(call.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                </div>
                <div className={styles.callCaller}>{call.caller_number || "Incoming..."}</div>
                <div className={styles.callIdSnippet}>{call.conversation_id.substring(0, 12)}...</div>
              </div>
            ))}
          </div>
        </aside>

        {/* Main: Selected Conversation Transcript */}
        <section className={styles.transcriptView}>
          {selectedCallId ? (
            <>
              <div className={styles.transcriptHeader}>
                <div>
                  <h3>Monitoring: {activeCalls.find(c => c.conversation_id === selectedCallId)?.caller_number || "Active Session"}</h3>
                  <p className={styles.sessionId}>ID: {selectedCallId}</p>
                </div>
              </div>

              <div ref={chatContainerRef} className={styles.chatContainer}>
                {messages.length === 0 && (
                  <div className={styles.emptyState}>Waiting for conversation to start...</div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className={msg.role === "user" ? styles.msgUser : styles.msgAgent}>
                    <div className={styles.msgHeader}>
                      <span className={styles.msgRole}>{msg.role === "user" ? "Caller" : "AI Agent"}</span>
                      <span className={styles.msgTime}>{new Date(msg.created_at).toLocaleTimeString()}</span>
                    </div>
                    <div className={styles.msgText}>{msg.text}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.noSelection}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p>Select a conversation from the sidebar to start monitoring</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
