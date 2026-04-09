import { execSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const distDir = join(root, "dist");
const zipPath = join(root, "flox-chrome-web-store.zip");

function walkAndRemoveJunk(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walkAndRemoveJunk(abs);
      continue;
    }
    if (
      entry.endsWith(".map") ||
      entry === ".gitignore" ||
      entry === "tsconfig.json" ||
      entry === "vite.config.ts" ||
      entry === "vite.config.js"
    ) {
      rmSync(abs, { force: true });
    }
  }
}

execSync("npm run build", { stdio: "inherit" });

if (!existsSync(distDir)) {
  throw new Error("dist folder not found after build");
}
if (!existsSync(join(distDir, "manifest.json"))) {
  throw new Error("manifest.json is not in dist root");
}

walkAndRemoveJunk(distDir);
rmSync(zipPath, { force: true });

// Zip dist CONTENTS (not dist folder itself)
execSync(`cd "${distDir}" && zip -r "${zipPath}" . -x "*.DS_Store"`, { stdio: "inherit" });

console.log(`\nCreated: ${zipPath}`);
