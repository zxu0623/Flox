/**
 * One-off style pass: prefix legacy dark-only zinc utilities with light counterparts + dark:.
 * Skips occurrences already part of dark: (negative lookbehind).
 */
import fs from "node:fs";

const files = [
  "src/popup/main.tsx",
  "src/dashboard/main.tsx",
  "src/components/UpgradePrompt.tsx",
  "src/feedback/main.tsx"
];

const pairs = [
  ["bg-zinc-950/95", "bg-zinc-50/95 dark:bg-zinc-950/95"],
  ["bg-zinc-950", "bg-zinc-50 dark:bg-zinc-950"],
  ["bg-zinc-900/80", "bg-zinc-100/95 dark:bg-zinc-900/80"],
  ["bg-zinc-900/50", "bg-zinc-100/90 dark:bg-zinc-900/50"],
  ["bg-zinc-900/40", "bg-zinc-50/95 dark:bg-zinc-900/40"],
  ["bg-zinc-900/30", "bg-zinc-50 dark:bg-zinc-900/30"],
  ["bg-zinc-900", "bg-zinc-100 dark:bg-zinc-900"],
  ["bg-zinc-800", "bg-zinc-200 dark:bg-zinc-800"],
  ["border-zinc-800/80", "border-zinc-200/90 dark:border-zinc-800/80"],
  ["border-zinc-800/70", "border-zinc-200/80 dark:border-zinc-800/70"],
  ["border-zinc-800/60", "border-zinc-200/70 dark:border-zinc-800/60"],
  ["border-zinc-800", "border-zinc-200 dark:border-zinc-800"],
  ["border-zinc-700", "border-zinc-300 dark:border-zinc-700"],
  ["text-zinc-50", "text-zinc-950 dark:text-zinc-50"],
  ["text-zinc-100", "text-zinc-900 dark:text-zinc-100"],
  ["text-zinc-200", "text-zinc-800 dark:text-zinc-200"],
  ["text-zinc-300", "text-zinc-700 dark:text-zinc-300"],
  ["text-zinc-400", "text-zinc-600 dark:text-zinc-400"],
  ["hover:bg-zinc-900", "hover:bg-zinc-200 dark:hover:bg-zinc-900"],
  ["hover:bg-zinc-800", "hover:bg-zinc-300 dark:hover:bg-zinc-800"],
  ["hover:text-zinc-300", "hover:text-zinc-600 dark:hover:text-zinc-300"],
  ["hover:text-zinc-200", "hover:text-zinc-700 dark:hover:text-zinc-200"],
  ["shadow-black/40", "shadow-zinc-400/15 dark:shadow-black/40"],
  ["hover:shadow-black/30", "hover:shadow-zinc-400/15 dark:hover:shadow-black/30"],
  ["bg-black/55", "bg-zinc-900/35 dark:bg-black/55"],
  ["bg-black/50", "bg-zinc-900/30 dark:bg-black/50"],
  ["bg-amber-900/15", "bg-amber-50 dark:bg-amber-900/15"],
  ["border-amber-600/40", "border-amber-200 dark:border-amber-600/40"],
  ["border-amber-500/40", "border-amber-300 dark:border-amber-500/40"],
  ["border-amber-500/30", "border-amber-200 dark:border-amber-500/30"],
  ["bg-amber-500/10", "bg-amber-100/90 dark:bg-amber-500/10"],
  ["text-amber-100", "text-amber-950 dark:text-amber-100"],
  ["text-amber-200/90", "text-amber-900/95 dark:text-amber-200/90"],
  ["text-amber-200/80", "text-amber-900/90 dark:text-amber-200/80"],
  ["text-amber-200", "text-amber-900 dark:text-amber-200"],
  ["text-amber-300", "text-amber-800 dark:text-amber-300"],
  ["shadow-amber-950/30", "shadow-amber-300/25 dark:shadow-amber-950/30"],
  ["border-amber-500/25", "border-amber-300 dark:border-amber-500/25"],
  ["bg-amber-950/20", "bg-amber-50 dark:bg-amber-950/20"],
  ["text-amber-300/70", "text-amber-800/90 dark:text-amber-300/70"],
  ["bg-violet-950/40", "bg-violet-100/80 dark:bg-violet-950/40"],
  ["border-violet-500/40", "border-violet-300 dark:border-violet-500/40"],
  ["hover:bg-violet-950/60", "hover:bg-violet-200/80 dark:hover:bg-violet-950/60"],
  ["text-violet-100", "text-violet-950 dark:text-violet-100"],
  ["bg-rose-950/20", "bg-rose-50 dark:bg-rose-950/20"],
  ["hover:bg-rose-950/40", "hover:bg-rose-100 dark:hover:bg-rose-950/40"],
  ["border-rose-800/60", "border-rose-300 dark:border-rose-800/60"],
  ["border-rose-800", "border-rose-300 dark:border-rose-800"],
  ["border-rose-700/50", "border-rose-300 dark:border-rose-700/50"],
  ["border-rose-700", "border-rose-400 dark:border-rose-700"],
  ["text-rose-300", "text-rose-800 dark:text-rose-300"],
  ["text-rose-200", "text-rose-900 dark:text-rose-200"]
];

function replaceAll(content, from, to) {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<!dark:)${escaped}`, "g");
  return content.replace(re, to);
}

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  const before = content;
  for (const [from, to] of pairs) {
    content = replaceAll(content, from, to);
  }
  if (content !== before) {
    fs.writeFileSync(file, content);
    console.log("updated", file);
  } else {
    console.log("unchanged", file);
  }
}
