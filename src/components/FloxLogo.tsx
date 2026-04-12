import React from "react";

type FloxLogoSize = "sm" | "md" | "lg";

const sizeToIconPx: Record<FloxLogoSize, number> = {
  sm: 20,
  md: 26,
  lg: 30
};

const sizeToText: Record<FloxLogoSize, string> = {
  sm: "text-[1.05rem] leading-none",
  md: "text-xl leading-none",
  lg: "text-2xl leading-tight"
};

/**
 * Brand mark: stacked flowing “tabs” + gradient wordmark (Outfit).
 */
export function FloxLogo({
  size = "md",
  className = ""
}: {
  size?: FloxLogoSize;
  className?: string;
}) {
  const gradId = React.useId().replace(/:/g, "");
  const w = sizeToIconPx[size];
  const text = sizeToText[size];

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width={w}
        height={w}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="2" y1="4" x2="30" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fcd34d" />
            <stop offset="0.45" stopColor="#f59e0b" />
            <stop offset="1" stopColor="#ea580c" />
          </linearGradient>
        </defs>
        <rect x="3" y="5" width="20" height="5.5" rx="2.75" fill={`url(#${gradId})`} opacity="0.38" />
        <rect x="5" y="12.25" width="24" height="5.5" rx="2.75" fill={`url(#${gradId})`} opacity="0.72" />
        <rect x="2" y="19.5" width="28" height="6.5" rx="3.25" fill={`url(#${gradId})`} />
      </svg>
      <span
        className={`font-flox font-semibold tracking-[-0.06em] ${text} bg-gradient-to-r from-amber-700 via-orange-600 to-amber-600 bg-clip-text text-transparent dark:from-amber-100 dark:via-amber-200 dark:to-amber-300`}
      >
        Flox
      </span>
    </span>
  );
}
