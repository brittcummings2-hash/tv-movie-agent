"use client";

import { useState } from "react";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export type AppTab = "upnext" | "watched";

const TABS: { id: AppTab; label: string }[] = [
  { id: "upnext", label: "Up Next" },
  { id: "watched", label: "Watched" },
];

interface NavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export function Nav({ activeTab, onTabChange }: NavProps) {
  const [greetingLabel] = useState(greeting);

  return (
    <header className="site-header">
      <div className="header-greeting">
        <span className="header-greeting-text">
          {greetingLabel}, <span style={{ color: "var(--coral)" }}>Brittany</span>
          <span style={{ color: "var(--coral)" }}>.</span>
        </span>
      </div>

      <div className="header-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="header-actions" />
    </header>
  );
}
