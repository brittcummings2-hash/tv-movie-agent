"use client";

import { useState } from "react";

interface StarRatingProps {
  value: number;
  interactive?: boolean;
  onChange?: (value: number) => void;
}

export function StarRating({ value, interactive = false, onChange }: StarRatingProps) {
  const [glowStar, setGlowStar] = useState<number | null>(null);

  function handleRate(starValue: number) {
    onChange?.(starValue);
    setGlowStar(starValue);
    window.setTimeout(() => setGlowStar(null), 450);
  }

  return (
    <span
      className={`star-rating${interactive ? " star-rating-interactive" : ""}`}
      aria-label={`Rating ${value} out of 5`}
    >
      {Array.from({ length: 5 }, (_, i) => {
        const starValue = i + 1;
        const filled = starValue <= value;

        if (interactive) {
          return (
            <button
              key={i}
              type="button"
              className={`star-button${filled ? "" : " star-rating-empty"}${
                glowStar === starValue ? " star-button-glow" : ""
              }`}
              onClick={() => handleRate(starValue)}
              aria-label={`Rate ${starValue} out of 5`}
            >
              ★
            </button>
          );
        }

        return (
          <span key={i} className={filled ? undefined : "star-rating-empty"}>
            ★
          </span>
        );
      })}
    </span>
  );
}
