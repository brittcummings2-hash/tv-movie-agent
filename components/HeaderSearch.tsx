"use client";

import { useEffect, useRef, useState } from "react";

const PLACEHOLDERS = [
  "Search shows...",
  'Try "Shogun"',
  'Try "Netflix"',
  'Try "In Progress"',
];

interface HeaderSearchProps {
  value: string;
  onChange: (value: string) => void;
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20L16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function HeaderSearch({ value, onChange }: HeaderSearchProps) {
  const [expanded, setExpanded] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [expanded]);

  useEffect(() => {
    if (value.trim()) {
      setExpanded(true);
    }
  }, [value]);

  useEffect(() => {
    if (!expanded || value.trim()) return;
    const timer = setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % PLACEHOLDERS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [expanded, value]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onChange("");
        setExpanded(false);
      }
    }

    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node) && !value.trim()) {
        setExpanded(false);
      }
    }

    if (!expanded) return;

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [expanded, onChange, value]);

  const placeholder = value.trim() ? "Search shows..." : PLACEHOLDERS[placeholderIndex];

  return (
    <div
      ref={wrapRef}
      className={`header-search${expanded ? " header-search--expanded" : ""}`}
    >
      {!expanded ? (
        <button
          type="button"
          className="header-search-toggle"
          onClick={() => setExpanded(true)}
          aria-label="Search shows"
        >
          <SearchIcon />
        </button>
      ) : (
        <div className="header-search-field">
          <span className="header-search-icon">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            className="header-search-input"
            type="text"
            enterKeyHint="search"
            autoComplete="off"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            aria-label="Search shows"
          />
          {value && (
            <button
              type="button"
              className="header-search-clear"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}
