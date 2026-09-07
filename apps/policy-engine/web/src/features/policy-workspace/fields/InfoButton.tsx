/** Provides an accessible disclosure control for field-specific implementation guidance. */
import { useEffect, useRef, useId, useState, type JSX } from "react";

export function InfoButton(props: {
  label: string;
  description: string;
  source?: string | undefined;
  facts?: readonly string[] | undefined;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const id = useId();
  const popoverId = `${id}-info`;
  const popoverRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
    }

    function handleMouseDown(event: MouseEvent): void {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [open]);

  return (
    <span className="info-popover">
      <button
        ref={triggerRef}
        className="info-button"
        type="button"
        aria-controls={popoverId}
        aria-expanded={open}
        aria-label={`Info for ${props.label}`}
        onClick={() => setOpen((current) => !current)}
      >
        i
      </button>
      {open ? (
        <span ref={popoverRef} className="info-popover-panel" id={popoverId} role="region" aria-label={`Information for ${props.label}`}>
          <span className="info-popover-title">{props.label}</span>
          <span>{props.description}</span>
          {props.facts !== undefined && props.facts.length > 0 ? (
            <span className="info-popover-facts">
              {props.facts.map((fact) => (
                <span key={fact}>{fact}</span>
              ))}
            </span>
          ) : null}
          {props.source !== undefined ? <span className="info-popover-source">Source: {props.source}</span> : null}
          <button className="info-popover-close" type="button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>
            Close
          </button>
        </span>
      ) : null}
    </span>
  );
}
