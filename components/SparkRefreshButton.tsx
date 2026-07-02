"use client";

interface SparkRefreshButtonProps {
  running: boolean;
  onRefresh: () => void;
}

export function SparkRefreshButton({ running, onRefresh }: SparkRefreshButtonProps) {
  return (
    <div className="spark-refresh-bar">
      <button type="button" className="btn btn-primary btn-sm" onClick={onRefresh} disabled={running}>
        {running ? "Spark is thinking…" : "Run Spark agent"}
      </button>
      <p className="spark-refresh-copy">
        Reads your sheet, calls Gemini, and writes fresh picks with fit scores and tags.
      </p>
    </div>
  );
}
