"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import ReactECharts from "echarts-for-react";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

export default function AdminPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/conversations");
        if (!res.ok) throw new Error("Failed to fetch data");
        const json = await res.json();
        setData(json.conversations || []);
      } catch (err) {
        console.error("Error fetching admin data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // User authentication check
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email ?? "Admin");
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

  // ── Data Processing ──────────────────────────────────────────────────────────

  const totalCalls = data.length;
  const avgDuration = data.length > 0 
    ? Math.round(data.reduce((acc, curr) => acc + (curr.call_duration_secs || 0), 0) / data.length)
    : 0;
  const successRate = data.length > 0
    ? ((data.filter(c => c.call_successful === "success").length / data.length) * 100).toFixed(1)
    : 0;

  // Chart 1: Call Volume grouped by Date
  const volumeMap = data.reduce((acc: any, curr: any) => {
    const date = new Date(curr.start_time_unix_secs * 1000).toLocaleDateString();
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});

  const volumeDates = Object.keys(volumeMap).reverse();
  const volumeCounts = volumeDates.map(date => volumeMap[date]);

  const volumeOptions = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: volumeDates,
      axisLabel: { color: "#94a3b8" }
    },
    yAxis: { type: "value", axisLabel: { color: "#94a3b8" }, splitLine: { lineStyle: { color: "#334155" } } },
    series: [{
      name: "Calls",
      type: "line",
      smooth: true,
      data: volumeCounts,
      areaStyle: {
        color: {
          type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: "rgba(59, 130, 246, 0.5)" }, { offset: 1, color: "rgba(59, 130, 246, 0)" }]
        }
      },
      itemStyle: { color: "#3b82f6" }
    }]
  };

  // Chart 2: Initiation Source (Dynamic grouping)
  const sourceMap = data.reduce((acc: any, curr: any) => {
    const source = curr.conversation_initiation_source || "unknown";
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});

  const sourceData = Object.keys(sourceMap).map(key => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    value: sourceMap[key]
  }));

  const sourceOptions = {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    legend: { bottom: "5%", left: "center", textStyle: { color: "#94a3b8" } },
    series: [{
      name: "Source",
      type: "pie",
      radius: ["40%", "70%"],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: "#1e293b", borderWidth: 2 },
      label: { show: false, position: "center" },
      emphasis: { label: { show: true, fontSize: 16, fontWeight: "bold", color: "#f8fafc" } },
      labelLine: { show: false },
      data: sourceData,
      color: ["#3b82f6", "#10b981", "#f59e0b", "#6366f1"]
    }]
  };

  // Chart 3: Termination Reason
  const reasons = [...new Set(data.map(c => c.termination_reason || "Unknown"))];
  const reasonData = reasons.map(r => ({
    name: r.length > 20 ? r.substring(0, 20) + "..." : r,
    value: data.filter(c => c.termination_reason === r).length
  }));

  const reasonOptions = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
    xAxis: { type: "value", axisLabel: { color: "#94a3b8" }, splitLine: { lineStyle: { color: "#334155" } } },
    yAxis: { type: "category", data: reasonData.map(d => d.name), axisLabel: { color: "#94a3b8" } },
    series: [{
      name: "Count",
      type: "bar",
      data: reasonData.map(d => d.value),
      itemStyle: {
        color: {
          type: "linear", x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [{ offset: 0, color: "#3b82f6" }, { offset: 1, color: "#60a5fa" }]
        },
        borderRadius: [0, 4, 4, 0]
      }
    }]
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logoContainer} onClick={() => router.push("/dashboard")}>
          <svg className={styles.logoIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
          </svg>
          <span className={styles.logoText}>PriorityLine Analytics</span>
        </div>
        
        <div className={styles.headerRight}>
          <div className={styles.avatarContainer} ref={dropdownRef}>
            <button className={styles.avatarBtn} onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
              <div className={styles.avatar}>
                <Image src="/abstract_bg.png" alt="User" width={40} height={40} style={{objectFit: 'cover'}} />
              </div>
            </button>

            {isDropdownOpen && (
              <div className={styles.dropdownMenu}>
                <div className={styles.dropdownHeader}>
                  <span className={styles.dropdownUsername}>{userEmail}</span>
                </div>
                <div className={styles.dropdownDivider}></div>
                <Link href="/dashboard" className={styles.dropdownItemPrimary}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>
                  </svg>
                  Back to Dashboard
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
        <h1 className={styles.pageTitle}>Admin Dashboard</h1>

        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total Calls</span>
            <span className={styles.statValue}>{totalCalls}</span>
            <div className={`${styles.statTrend} ${styles.trendUp}`}>
              <span>↑ 12%</span> vs last week
            </div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Avg Duration</span>
            <span className={styles.statValue}>{avgDuration}s</span>
            <div className={`${styles.statTrend} ${styles.trendUp}`}>
              <span>↑ 5%</span> vs last week
            </div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Success Rate</span>
            <span className={styles.statValue}>{successRate}%</span>
            <div className={`${styles.statTrend} ${styles.trendDown}`}>
              <span>↓ 2%</span> vs last week
            </div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Active Agents</span>
            <span className={styles.statValue}>1</span>
            <div className={styles.statTrend}>
              Stable performance
            </div>
          </div>
        </div>

        <div className={styles.chartsGrid}>
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Call Volume</h3>
            {loading ? (
              <div className={styles.loadingOverlay}><div className={styles.spinner} /></div>
            ) : (
              <ReactECharts option={volumeOptions} style={{ height: "260px" }} />
            )}
          </div>

          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Initiation Source</h3>
            {loading ? (
              <div className={styles.loadingOverlay}><div className={styles.spinner} /></div>
            ) : (
              <ReactECharts option={sourceOptions} style={{ height: "260px" }} />
            )}
          </div>

          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Termination Reasons</h3>
            {loading ? (
              <div className={styles.loadingOverlay}><div className={styles.spinner} /></div>
            ) : (
              <ReactECharts option={reasonOptions} style={{ height: "260px" }} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
