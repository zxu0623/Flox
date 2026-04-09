import { defineManifest } from "@crxjs/vite-plugin";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const manifest = defineManifest({
  manifest_version: 3,
  default_locale: "en",
  name: "__MSG_appName__",
  version: "0.0.1",
  description: "__MSG_appDescription__",
  permissions: ["tabs", "storage", "tabGroups", "activeTab", "contextMenus", "alarms"],
  action: {
    default_popup: "popup.html",
    default_title: "__MSG_appName__"
  },
  commands: {
    stash_active_workspace: {
      suggested_key: {
        default: "Ctrl+Shift+S",
        mac: "Command+Shift+S"
      },
      description: "__MSG_commandStashWorkspace__"
    },
    open_dashboard: {
      suggested_key: {
        default: "Ctrl+Shift+D",
        mac: "Command+Shift+D"
      },
      description: "__MSG_commandOpenDashboard__"
    }
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/assign-prompt.tsx"],
      run_at: "document_idle"
    }
  ],
  background: {
    service_worker: "src/background/index.ts",
    type: "module"
  }
});

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        popup: "popup.html",
        dashboard: "dashboard.html"
      }
    }
  }
});
