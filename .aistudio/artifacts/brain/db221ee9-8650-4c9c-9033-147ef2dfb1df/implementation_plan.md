# Permanent Per-User-ID Virtual LAN IP & Auto-Login Counter Sync

Assigns every User ID (Business Mobile Number) a **single, unique, permanent Virtual IP address** and **Direct Auto-Login Counter Link** that never changes across restarts or networks, and automatically logs the 2nd PC directly into that User ID's counter workspace with live synchronized data.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Choices from Phase 1:**
> - **Permanent Per-ID IP Strategy**: Every User ID receives its own unique, fixed Virtual IP (`10.88.X.Y:3000`) and permanent counter route (`/ip/10.88.X.Y`) that is permanently stored in the database and never changes.
> - **2nd PC Behavior**: Opening a User ID's permanent IP link on a 2nd PC automatically logs straight into that User ID's counter screen and syncs live data (Bills, Parties, Stock) without manual login steps.
> - **Printing Untouched**: No changes will be made to invoice printing or print setup templates.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **One Unique, Permanent IP Per User ID**: Each registered User ID (`+91 XXXXXXXXXX`) is deterministically assigned a unique, immutable IPv4 address (`10.88.<octet3>.<octet4>:3000`) stored permanently in `server_db.json` and Firebase Cloud Firestore. Two different User IDs will always have two different permanent IPs, and a User ID's IP will never change even if Wi-Fi or the router restarts.
  2. **Single Permanent IP Display**: Removes dynamic/changing router IP lists and displays only the logged-in User ID's **single permanent IP address** and **1-Click Copy Auto-Login URL** in the Left Sidebar and Backup & Sync page.
  3. **Instant 2nd-PC Auto-Login**: Opening the permanent IP link (`/ip/10.88.X.Y` or `?ip=10.88.X.Y`) on a 2nd PC automatically authenticates that User ID with the server, pulls the latest bills/products/parties, and opens the counter dashboard immediately.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Viewing & Copying the Permanent IP (PC 1)**:
     - In the Left Sidebar session card and in **Backup & Sync**, the user sees their dedicated **Permanent Counter IP** (e.g., `10.88.142.75:3000` — `FIXED / NO-CHANGE`) along with a 1-click **Copy Permanent 2nd-PC Link** button.
  2. **Opening on 2nd PC (Auto-Login)**:
     - When the user opens that permanent link on PC 2, the app detects the `/ip/10.88.X.Y` path (or `?ip=10.88.X.Y` parameter), verifies the permanent IP against `/api/auth/permanent-ip/:ip`, automatically logs into that User ID's counter session, and synchronizes all bills, stock items, and party ledgers in real time.
- **Visual Identity & Theme**:
  - Uses monospace tabular numerals (`font-mono tabular-nums`) for all IP addresses, port numbers, and sync timestamps.
  - Clean high-contrast slate surfaces (`#0F172A` / `#FFFFFF`) with emerald status text indicating that the assigned IP is **Permanent & Locked** to the current User ID.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Deterministic + Persisted Per-ID Virtual IP Mapping**
  - *Chosen Approach*: Compute a unique `10.88.X.Y:3000` Virtual IP from the 10-digit User ID and persist it inside both `server_db.json` and Firebase Firestore (`sync_data/{phone}.permanentIp`).
  - *Why*: Hardware router DHCP IPs (`192.168.1.x`) are shared by all accounts on the same PC and can change when a router reboots. A deterministic per-ID Virtual IP stored in the user's record guarantees that (a) every User ID has a distinct IP and (b) it never changes.
- **Decision 2: Seamless URL Routing (`/ip/<permanent-ip>`) with Auto-Login**
  - *Chosen Approach*: Support `/ip/<permanent-ip>` on the Express server and SPA router so opening the link on any 2nd PC resolves the owning User ID and triggers `handleLoginSuccess` automatically.
  - *Why*: Eliminates manual credential entry on secondary counters while keeping both PCs connected to the exact same account and live dataset.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     User Account (+91 Mobile Number)                     │
│        Deterministic Permanent IP Generator -> 10.88.<Oct3>.<Oct4>:3000  │
└───────────────────┬──────────────────────────────────────┬───────────────┘
                    │ Persisted Forever                    │
                    ▼                                      ▼
┌───────────────────────────────────────┐  ┌───────────────────────────────┐
│   Express Server (server_db.json)     │  │  Firebase Cloud Firestore     │
│ - GET /api/network-info?phone=<id>    │  │ - sync_data/{phone}           │
│ - GET /api/auth/permanent-ip/:ip      │  │   stores permanentIp & data   │
│ - SPA Route /ip/:ip -> Auto-Login     │  └───────────────┬───────────────┘
└───────────────────┬───────────────────┘                  │
                    │                                      │
                    ▼                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    PC 1 & PC 2 Counter Workspaces                        │
│ - Left Sidebar & Backup Page show ONLY the 1 Permanent IP for that ID    │
│ - Opening /ip/10.88.X.Y on PC 2 auto-logs into that User ID's Counter    │
│ - Real-time Firestore + 6s Server Poll keeps Bills/Stock/Parties synced  │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Interactive Component & State Mapping**:
  - **Permanent IP Utility**: Pure helper `getPermanentIpForUser(phone)` that converts any 10-digit User ID into its fixed `10.88.X.Y:3000` address and permanent auto-login URL (`/ip/10.88.X.Y`).
  - **Backend Resolution (`/api/auth/permanent-ip/:ip`)**: Looks up the user matching the permanent IP (or creates/restores the session from synced data) and returns `{ phone, businessName, role, password, permanentIp }`.
  - **Frontend Auto-Login Detector**: On app startup, inspects the URL path (`/ip/...`) or query (`?ip=...`), calls `/api/auth/permanent-ip/:ip`, logs in automatically via `handleLoginSuccess`, and cleans the URL bar so the user lands directly on the live Dashboard.
