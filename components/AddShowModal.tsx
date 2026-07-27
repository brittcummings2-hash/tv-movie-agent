"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { ToastMessage, UserRating } from "@/lib/types";
import { createToast } from "./Toast";

interface TitleCandidate {
  tmdbId: number;
  title: string;
  year: number | null;
  kind: "tv" | "movie";
  posterUrl: string | null;
  overview: string;
  releaseDate: string;
}

interface AddShowModalProps {
  onClose: () => void;
  onAdded: (item: UserRating) => void;
  onToast: (toast: ToastMessage) => void;
}

type AddStatus = "watching" | "want_to_watch";

export function AddShowModal({ onClose, onAdded, onToast }: AddShowModalProps) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<AddStatus>("watching");
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<TitleCandidate[] | null>(null);
  const [selected, setSelected] = useState<number>(0); // index into candidates; -1 = "as typed"
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function createEntry(entry: {
    show_title: string;
    release_date: string;
    media_kind?: "tv" | "movie";
  }) {
    const res = await fetch("/api/watched", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry: {
          show_title: entry.show_title,
          rating: 0,
          release_date: entry.release_date,
          platform: "",
          watch_status: status,
          comments: "",
          ...(entry.media_kind ? { media_kind: entry.media_kind } : {}),
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not add show");

    onAdded(data.item as UserRating);
    const label = status === "watching" ? "In Progress" : "your Watch List";
    onToast(
      createToast(
        "success",
        `Added ${data.item?.show_title ?? entry.show_title} to ${label} — profiling it in the background`
      )
    );
    onClose();
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    const query = title.trim();
    if (!query || busy) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/title-search?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as { candidates?: TitleCandidate[] };
      const found = data.candidates ?? [];
      if (found.length === 0) {
        // Nothing on TMDB — add exactly what she typed.
        await createEntry({ show_title: query, release_date: "" });
        return;
      }
      setCandidates(found);
      setSelected(0);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not add show";
      onToast(createToast("error", msg));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      const choice = selected >= 0 ? candidates?.[selected] : null;
      if (choice) {
        await createEntry({
          show_title: choice.title,
          release_date: choice.releaseDate,
          media_kind: choice.kind,
        });
      } else {
        await createEntry({ show_title: title.trim(), release_date: "" });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not add show";
      onToast(createToast("error", msg));
    } finally {
      setBusy(false);
    }
  }

  const picking = candidates !== null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="add-show-title"
      >
        <h2 id="add-show-title" className="modal-title">
          Add a show
        </h2>
        {!picking ? (
          <>
            <p className="modal-copy">Enter the title and where it should go.</p>
            <form onSubmit={handleSearch}>
              <div className="form-field">
                <label htmlFor="add-show-input">Title</label>
                <input
                  ref={inputRef}
                  id="add-show-input"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. The Dark"
                  aria-label="Show or movie title"
                  disabled={busy}
                />
              </div>
              <div className="form-field">
                <label>Add to</label>
                <div className="add-status-options">
                  <button
                    type="button"
                    className={`tag tag-muted add-status-option${status === "watching" ? " add-status-option--selected" : ""}`}
                    onClick={() => setStatus("watching")}
                    aria-pressed={status === "watching"}
                  >
                    In Progress
                  </button>
                  <button
                    type="button"
                    className={`tag tag-muted add-status-option${status === "want_to_watch" ? " add-status-option--selected" : ""}`}
                    onClick={() => setStatus("want_to_watch")}
                    aria-pressed={status === "want_to_watch"}
                  >
                    Watch List
                  </button>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !title.trim()}>
                  {busy ? "Searching…" : "Next"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <p className="modal-copy">Which one did you mean?</p>
            <div className="candidate-list" role="radiogroup" aria-label="Matching titles">
              {candidates.map((candidate, index) => (
                <button
                  key={`${candidate.kind}-${candidate.tmdbId}`}
                  type="button"
                  role="radio"
                  aria-checked={selected === index}
                  className={`candidate-row${selected === index ? " candidate-row--selected" : ""}`}
                  onClick={() => setSelected(index)}
                >
                  {candidate.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="candidate-poster" src={candidate.posterUrl} alt="" />
                  ) : (
                    <span className="candidate-poster candidate-poster--empty" />
                  )}
                  <span className="candidate-info">
                    <span className="candidate-title">{candidate.title}</span>
                    <span className="candidate-meta">
                      {[candidate.year, candidate.kind === "tv" ? "TV series" : "Movie"]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {candidate.overview && (
                      <span className="candidate-overview">{candidate.overview}</span>
                    )}
                  </span>
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={selected === -1}
                className={`candidate-row candidate-row--plain${selected === -1 ? " candidate-row--selected" : ""}`}
                onClick={() => setSelected(-1)}
              >
                <span className="candidate-info">
                  <span className="candidate-title">None of these</span>
                  <span className="candidate-meta">Add “{title.trim()}” exactly as typed</span>
                </span>
              </button>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setCandidates(null)}
                disabled={busy}
              >
                Back
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleConfirm} disabled={busy}>
                {busy ? "Adding…" : "Add"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
