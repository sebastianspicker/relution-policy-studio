import type { JSX } from "react";

type IconProps = {
  readonly size?: number;
};

export function IconPolicies({ size = 20 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="14" height="12" rx="1.5" />
      <path d="M3 8h14" />
      <path d="M7 2v3M13 2v3" />
      <path d="M6 12h4M6 15h6" />
    </svg>
  );
}

export function IconBaseline({ size = 20 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 2L3 6v4c0 4 3 7 7 8 4-1 7-4 7-8V6L10 2z" />
      <path d="M7 10l2 2 4-4" />
    </svg>
  );
}

export function IconDashboard({ size = 20 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="11" width="4" height="7" rx="1" />
      <rect x="8" y="6" width="4" height="12" rx="1" />
      <rect x="14" y="2" width="4" height="16" rx="1" />
    </svg>
  );
}

export function IconSettings({ size = 20 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" />
    </svg>
  );
}

export function IconUndo({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 6h7a4 4 0 0 1 0 8H5" />
      <path d="M2 6l3-3M2 6l3 3" />
    </svg>
  );
}

export function IconRedo({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 6H7a4 4 0 0 0 0 8h4" />
      <path d="M14 6l-3-3M14 6l-3 3" />
    </svg>
  );
}

export function IconInspector({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1" y="2" width="14" height="12" rx="1.5" />
      <path d="M10 2v12" />
      <path d="M12 6h1M12 9h1" />
    </svg>
  );
}

export function IconCheck({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 8.5l3.5 3.5 7-7" />
    </svg>
  );
}

export function IconEye({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

export function IconCode({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4L1 8l4 4M11 4l4 4-4 4" />
      <path d="M9.5 2.5l-3 11" />
    </svg>
  );
}

export function IconLayers({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 1l7 4-7 4L1 5l7-4z" />
      <path d="M1 9l7 4 7-4" />
      <path d="M1 12.5l7 4 7-4" />
    </svg>
  );
}
