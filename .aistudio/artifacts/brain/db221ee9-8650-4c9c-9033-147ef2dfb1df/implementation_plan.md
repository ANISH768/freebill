# Auto-Download `Saved_Bills_Data.json` Settings Toggle

Adds a synchronized toggle in both **Settings → Auto-Backup & Sync** and the **Billing Screen** so that whenever a bill is created or saved, the complete `Saved_Bills_Data.json` archive is automatically downloaded to the user's local `Downloads` folder.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following product decisions were confirmed during clarification and govern this implementation:

- **Toggle Placement**: Available in **both** the **Settings → Auto-Backup & Sync** tab and directly on the **Billing Screen**, with real-time synchronization between both locations.
- **Downloaded File Naming**: Always saved with the fixed file name **`Saved_Bills_Data.json`** in the user's Downloads folder so the latest complete backup file is consistently named and easy to locate or restore via **Add File Data**.

---

## 1. Overview & Core Concept

- **What It Does**: Provides a persistent setting (`autoDownloadBillFile` inside `AppSettings.autoBackup` and synced with `auto_download_bill_file` in `localStorage`) that triggers a browser download of `Saved_Bills_Data.json` to the local `Downloads` folder every time an invoice/estimate is saved (`Save & Print` or `Save Invoice Only`).
- **Target Audience / Persona**: Retail counter operators and shop owners who want an automatic, hands-free physical backup file saved directly to their computer or mobile `Downloads` folder on every bill without manual exporting.
- **Key Value**: Simplifies external archival and disaster recovery—if browser data is ever cleared, the user can immediately scan or select `Saved_Bills_Data.json` from their `Downloads` folder to restore all bills, products, and parties.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Enabling via Settings**: The user navigates to **Settings → Auto-Backup & Sync** (`Tab 7`) and sees a dedicated card: **"Auto-Download `Saved_Bills_Data.json` to Downloads Folder on Bill Save"**, complete with a switch toggle and a **"Download `Saved_Bills_Data.json` Now"** action button for immediate manual export.
  2. **Enabling/Toggling via Billing Screen**: On the **Create Sales Invoice** screen, the quick toggle above the Save buttons reflects the exact same state and updates the central `AppSettings` store when toggled.
  3. **Automatic Local Download on Bill Save**: When the toggle is enabled and the user saves a bill, the application updates the internal `Saved_Bills_Data.json` store and immediately triggers a download of `Saved_Bills_Data.json` to the system `Downloads` folder, accompanied by a confirmation toast.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Utilitarian enterprise POS & SaaS dashboard aesthetic with single-elevation flat surfaces and 1px structural borders (`border-slate-200 dark:border-slate-800`).
  - *Color Palette & Mood*: Neutral slate canvas (`#FFFFFF` / `#0F172A`) with high-intent emerald (`#16A34A`) and blue (`#2563EB`) accents for active backup states.
  - *Typography & Hierarchy*: Crisp sans-serif headings paired with tabular monospace (`font-mono tabular-nums`) for file names (`Saved_Bills_Data.json`) and record counts.
- **Interactive Feedback & Motion**:
  - Instantaneous switch transition ($\le 200\text{ms}$) and toast confirmation (`"Auto-Download Saved_Bills_Data.json enabled"` / `"disabled"`) when toggled in Settings.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Unified Settings State & Cross-View Synchronization**
  - *Chosen Approach*: Store `autoDownloadBillFile: boolean` inside `AppSettings.autoBackup` AND synchronize it with the `auto_download_bill_file` key in `localStorage` + the global `app_settings_updated` custom event.
  - *Why*: Ensures toggling the setting in **Settings → Auto-Backup & Sync** immediately updates the **Billing Screen** (and vice versa) and persists per user account.
- **Decision 2: Complete Dataset Inside `Saved_Bills_Data.json`**
  - *Chosen Approach*: Every time `Saved_Bills_Data.json` is downloaded on bill save, it bundles the newly saved bill along with all current `estimates`, `products`, `clients`, and `stockLogs`.
  - *Why*: Guarantees that restoring from the single `Saved_Bills_Data.json` file in the `Downloads` folder restores the entire shop state in one step.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Unified AppSettings Store (localStorage)             │
│   autoBackup.autoDownloadBillFile  <───>  "auto_download_bill_file"     │
└───────────────────┬─────────────────────────────────┬───────────────────┘
                    │                                 │
                    ▼                                 ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────┐
│   Settings -> Auto-Backup & Sync Tab  │ │    Billing Screen (POS)       │
│  - Toggle Switch (ON / OFF)           │ │  - Quick Toggle Checkbox      │
│  - "Download File Now" Button         │ │  - Save & Print / Save Only   │
└───────────────────────────────────────┘ └───────────────┬───────────────┘
                                                          │
                                                          ▼
                                          ┌───────────────────────────────┐
                                          │    Bill Save Handler          │
                                          │ 1. Persist to Server & Local  │
                                          │ 2. If Toggle ON -> Trigger    │
                                          │    Browser Download of        │
                                          │    "Saved_Bills_Data.json"    │
                                          └───────────────────────────────┘
```

### Interactive Component & State Mapping
- **Settings Backup Panel**:
  - Renders the toggle switch bound to `settings.autoBackup.autoDownloadBillFile`.
  - When toggled, updates `AppSettings`, writes `auto_download_bill_file` to `localStorage`, dispatches `app_settings_updated`, and displays a status toast.
  - Provides a **"Download `Saved_Bills_Data.json` Now"** button so users can also trigger an on-demand download of their current billing archive from Settings.
- **Billing Screen (`CreateEstimate`)**:
  - Listens to `app_settings_updated` and syncs its checkbox with `AppSettings.autoBackup.autoDownloadBillFile`.
- **Bill Save Lifecycle**:
  - Checks `getSavedAppSettings(currentUser).autoBackup.autoDownloadBillFile` (or `localStorage.getItem('auto_download_bill_file') === 'true'`). When enabled, generates a formatted JSON Blob and downloads `Saved_Bills_Data.json` into the user's `Downloads` folder.
