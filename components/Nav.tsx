"use client";

import { HeaderSearch } from "./HeaderSearch";

export type AppTab = "watching" | "recommended" | "watched" | "stats";

const TABS: { id: AppTab; label: string }[] = [
  { id: "watching", label: "In Progress" },
  { id: "recommended", label: "Recommended" },
  { id: "watched", label: "Watched" },
  { id: "stats", label: "Stats" },
];

interface NavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onAddClick: () => void;
}

function AddIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Nav({ activeTab, onTabChange, searchQuery, onSearchChange, onAddClick }: NavProps) {
  return (
    <header className="site-header">
      <h1 className="site-title">
        TV Tracker<span className="site-title-dot">.</span>
      </h1>

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

      <div className="header-actions">
        <button type="button" className="header-add-toggle" onClick={onAddClick} aria-label="Add a show">
          <AddIcon />
        </button>
        <HeaderSearch value={searchQuery} onChange={onSearchChange} />
      </div>
    </header>
  );
}
