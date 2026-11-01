import { useEffect, useRef } from "react";
import type { ScreenData } from "./screens";

/**
 * The larger DOM view of a wall screen: the same `ScreenData`, every line, opened by
 * clicking the TV. Closes on the backdrop, the button or Escape.
 */
export default function DisplayOverlay({ data, onClose }: { data: ScreenData; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Plain DOM: the caller mounts this in its own root on document.body, never as a
  // portal inside the Canvas (the three reconciler cannot host DOM elements).
  return (
    <div className="display-backdrop" onClick={onClose}>
      <div
        className={`display-panel tone-${data.tone}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${data.title} status`}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{data.title}</h2>
          <button ref={closeRef} type="button" className="display-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {data.sections.map((section) => (
          <section key={section.heading}>
            <h3>{section.heading}</h3>
            <ul>
              {section.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="display-foot">Live from the office records</p>
      </div>
    </div>
  );
}
