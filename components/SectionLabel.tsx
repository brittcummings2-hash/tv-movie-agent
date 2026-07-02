export type SectionVariant =
  | "for-you"
  | "alerts"
  | "want-to-watch"
  | "in-progress"
  | "watched"
  | "dnf";

interface SectionLabelProps {
  label: string;
  variant?: SectionVariant;
}

export function SectionLabel({ label, variant }: SectionLabelProps) {
  return (
    <div className={`section-label${variant ? ` section-label--${variant}` : ""}`}>
      {variant && <span className="section-label-mark" aria-hidden="true" />}
      {label}
    </div>
  );
}
