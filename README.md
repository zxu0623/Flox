# Flox

Flox is a Chrome Extension (Manifest V3) for focused tab management. It auto-groups tabs by task, surfaces forgotten pages, and supports one-click stash/restore for full workspaces.

## Installation

1. Install dependencies:
   - `npm install`
2. Build extension:
   - `npm run build`
3. Open `chrome://extensions`
4. Enable Developer Mode
5. Click "Load unpacked" and select the `dist/` folder

## Features

- Workspace-based tab organization with URL pattern rules
- Popup quick actions (stash, restore, close, expand, unassigned tabs)
- Full Dashboard with drag-and-drop task management
- Saved Sessions with timestamped stash/restore
- Idle tab reminders and configurable thresholds
- Plan/Pro gating with reusable `checkFeature()` system
- Context menu assignment and keyboard shortcuts

## Screenshots (Placeholders)

- Popup overview: `store-assets/screenshot-popup-placeholder.png`
- Dashboard overview: `store-assets/screenshot-dashboard-placeholder.png`
- Settings and onboarding: `store-assets/screenshot-settings-placeholder.png`

## Development

- Stack: Vite + React + TypeScript + Tailwind + CRXJS
- Main entries:
  - Popup: `src/popup/main.tsx`
  - Dashboard: `src/dashboard/main.tsx`
  - Background service worker: `src/background/index.ts`
- Build:
  - `npm run build`

## Store Submission Checklist

Before publishing to Chrome Web Store, prepare:

- 128x128 extension icon
- At least 3 screenshots at 1280x800
- 440x280 small promotional tile
- Finalized privacy policy URL (if required by your release scope)
