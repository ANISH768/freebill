# Remove Duplicate Sidebar Options from Top Header & Dashboard

Clean up the Top Workspace Header (`main > div:first-child`) and the Dashboard so any option that already exists in the **Left Sidebar (`<aside>`)** is not duplicated.

## User Review & Critical Decisions

> [!IMPORTANT]
> Strictly removing all extra/duplicate buttons that are already available in the Left Sidebar:
> 1. **Top Header Bar (`main > div:nth-of-type(1) > div:nth-of-type(2)`)**:
>    - **Removed Duplicates**: `Add File Data`, `Shortcuts (F1)`, `Lock Counter`, `Settings`, and `+ New Bill` (all of these are already in the Left Sidebar).
>    - **Kept Unique Controls**: Only the **Caps Lock / Title Case status indicator**, **Dark/Light Mode toggle**, and **Cloud Sync status indicator** remain in the top-right bar.
> 2. **Dashboard Banner & Cards (`Dashboard.tsx`)**:
>    - **Removed Duplicates**: `+ Add Party` (already *Parties & Customers* in sidebar), `+ Add Item` (already *Items & Inventory* in sidebar), `Khata Ledger` (already *Ledgers & Passbook* in sidebar), `Print Setup` icon button (already *Print Setup* in sidebar), and extra duplicate `Open Khata` / `+ Fast Billing` links.
>    - **Kept Clean & Focused**: The Dashboard header shows store details, live date, and a single primary `+ Create Sales Invoice (नया बिल)` button, followed by the 4 KPI cards, Search/Filter bar, `📋 Recent Sales Invoices`, and the Baki & Counter Pulse panels.

---

## 1. Overview & Core Concept

- **What It Does**: Eliminates visual clutter by ensuring navigation and tool triggers that live in the Left Sidebar (`Sales / Invoices`, `Items & Inventory`, `Parties & Customers`, `Ledgers & Passbook`, `Print Setup`, `Backup & Sync`, `Settings`, `Add File Data`, `Shortcut Guide`, `Lock Counter`) are not repeated across the Top Header Bar or Dashboard.
- **Target Audience / Persona**: Counter operators who want a clean, uncluttered workspace without redundant buttons.
- **Key Value**: Cleaner header and Dashboard layout where every control has a single, clear home.

---

## 2. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌────────────────────────────────────────────────────────────────────────┐
│  Left Sidebar (<aside>) — Single Home for All Navigation & Tools       │
│  • Dashboard • Sales/Invoices • Inventory • Parties • Ledgers          │
│  • Print Setup • Backup • Settings • Add File Data • Shortcuts • Lock  │
├────────────────────────────────────────────────────────────────────────┤
│  Right Workspace (<main>) — Zero Duplicate Sidebar Buttons             │
│  • Top Bar: Page Title + [Caps Lock Status] + [Dark Mode] + [Sync]     │
│  • Dashboard Hero: Store Info + [+ Create Sales Invoice] only          │
│  • KPI Strip + Search/Filter + 📋 Recent Sales Invoices + Baki Summary │
└────────────────────────────────────────────────────────────────────────┘
```
