import React from "react";

type FloxLogoSize = "sm" | "md" | "lg";

const sizeToText: Record<FloxLogoSize, string> = {
  sm: "text-[16px] leading-none",
  md: "text-[20px] leading-none",
  lg: "text-[26px] leading-tight"
};

/**
 * Brand mark — serif wordmark only, matching preview.html's `.brand`.
 * Warm orange gradient in light mode; cream-orange gradient in dark mode.
 * No icon — the preview design relies on typography alone.
 */
export function FloxLogo({
  size = "md",
  className = ""
}: {
  size?: FloxLogoSize;
  className?: string;
}) {
  return (
    <span
      className={`font-flox font-semibold tracking-[-0.02em] ${sizeToText[size]} bg-clip-text text-transparent ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(135deg, var(--flox-brand-start, #9B3B10) 0%, var(--flox-brand-mid, #C96B38) 45%, var(--flox-brand-end, #D4843C) 100%)"
      }}
    >
      Flox
    </span>
  );
}
