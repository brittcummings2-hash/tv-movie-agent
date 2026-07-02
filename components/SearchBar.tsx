"use client";

import { useEffect, useState } from "react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

const PLACEHOLDERS = [
  "Search shows...",
  'Try "Shogun"',
  'Try "Netflix"',
  'Try "In Progress"',
];

export function SearchBar({ value, onChange }: SearchBarProps) {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    if (value.trim()) return;
    const timer = setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % PLACEHOLDERS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <div className="search-bar">
      <input
        className="search-input"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={value.trim() ? "Search shows..." : PLACEHOLDERS[placeholderIndex]}
        aria-label="Search shows"
      />
    </div>
  );
}
