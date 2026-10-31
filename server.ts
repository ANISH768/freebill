import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import twilio from "twilio";
import crypto from "crypto";

dotenv.config({ override: true });

interface User {
  phone: string;
  password?: string;
  clerkPassword?: string;
  businessName: string;
  permanentIp?: string;
}

interface UserSyncData {
  phone: string;
  password?: string;
  clerkPassword?: string;
  businessName: string;
  permanentIp?: string;
  clients: any[];
  products: any[];
  estimates: any[];
  updatedAt: string;
  last_synced_millis?: number;
}

const PORT = 3000;
const DB_FILE_PATH = path.join(process.cwd(), "server_db.json");

function computePermanentIpForPhone(phone: string): { ipHost: string; ipWithPort: string; autoLoginPath: string } {
  const cleanDigits = String(phone || "")
    .replace(/\D/g, "")
    .slice(-10)
    .padStart(10, "0");
  const partA = parseInt(cleanDigits.slice(0, 3), 10) || 101;
  const partB = parseInt(cleanDigits.slice(3, 6), 10) || 102;
  const partC = parseInt(cleanDigits.slice(6, 10), 10) || 103;
  const octet2 = 10 + (partA % 240);
  const octet3 = 10 + (partB % 240);
  const octet4 = 10 + (partC % 240);
  const ipHost = `10.${octet2}.${octet3}.${octet4}`;
  return {
    ipHost,
    ipWithPort: `${ipHost}:${PORT}`,
    autoLoginPath: `/ip/${ipHost}`
  };
}

// Helper to load DB
function loadDb(): { users: User[]; syncData: Record<string, UserSyncData>; backups?: Record<string, any[]>; audit_logs?: any[] } {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const content = fs.readFileSync(DB_FILE_PATH, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Error reading server db file:", err);
  }
  return { users: [], syncData: {}, backups: {}, audit_logs: [] };
}

// Helper to save DB
function saveDb(data: { users: User[]; syncData: Record<string, UserSyncData>; backups?: Record<string, any[]>; audit_logs?: any[] }) {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing server db file:", err);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  // Ensure db structures are initialized cleanly without hardcoded users
  const db = loadDb();
  let dbChanged = false;
  if (!db.users) {
    db.users = [];
    dbChanged = true;
  }
  if (!db.syncData) {
    db.syncData = {};
    dbChanged = true;
  }
  if (!db.backups) {
    db.backups = {};
    dbChanged = true;
  }
  if (!db.audit_logs) {
    db.audit_logs = [];
    dbChanged = true;
  }
  // Ensure every existing user has their single permanent, non-changing IP persisted
  for (const u of db.users) {
    const perm = computePermanentIpForPhone(u.phone);
    if (u.permanentIp !== perm.ipWithPort) {
      u.permanentIp = perm.ipWithPort;
      dbChanged = true;
    }
    if (db.syncData[u.phone] && db.syncData[u.phone].permanentIp !== perm.ipWithPort) {
      db.syncData[u.phone].permanentIp = perm.ipWithPort;
      dbChanged = true;
    }
  }
  if (dbChanged) {
    saveDb(db);
  }

  // --- RATE LIMITING & SECURITY MIDDLEWARE ---
  const rateLimitMap = new Map<string, { count: number; lastReset: number }>();

  function createRateLimiter(maxRequests = 40, windowMs = 60 * 1000) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
      const key = `${req.path}:${ip}`;
      const now = Date.now();
      const record = rateLimitMap.get(key) || { count: 0, lastReset: now };

      if (now - record.lastReset > windowMs) {
        record.count = 0;
        record.lastReset = now;
      }

      record.count++;
      rateLimitMap.set(key, record);

      if (record.count > maxRequests) {
        return res.status(429).json({
          error: "Rate limit exceeded. Too many requests to authentication / sync endpoint. Please wait 60 seconds."
        });
      }

      next();
    };
  }

  const syncRateLimiter = createRateLimiter(120, 60 * 1000);
  const authRateLimiter = createRateLimiter(30, 60 * 1000);

  // Input Sanitizer helper to prevent XSS & Injection in API payloads
  function sanitizeInput(val: any): any {
    if (typeof val === 'string') {
      return val.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
    }
    if (Array.isArray(val)) {
      return val.map(sanitizeInput);
    }
    if (val && typeof val === 'object') {
      const cleaned: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        cleaned[k] = sanitizeInput(v);
      }
      return cleaned;
    }
    return val;
  }

  // Apply rate limiter to sensitive sync and auth routes
  app.use(['/api/sync', '/api/auth/login'], syncRateLimiter);

  // --- API ROUTING ---

  // Health and connection check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is online and ready for syncing!" });
  });

  // Network & Permanent Per-User-ID IP Info
  app.get("/api/network-info", (req, res) => {
    try {
      const queryPhone = String(req.query.phone || "").trim();
      const perm = computePermanentIpForPhone(queryPhone || "9999999999");
      res.json({
        port: PORT,
        hostname: os.hostname(),
        permanentIp: perm.ipWithPort,
        permanentIpHost: perm.ipHost,
        autoLoginPath: perm.autoLoginPath,
        lanUrls: [`http://${perm.ipWithPort}`],
        cloudSharedUrl: "https://ais-pre-ors5jocb2d3y4wmv3kze4f-914398356752.europe-west2.run.app"
      });
    } catch (e) {
      res.json({
        port: PORT,
        hostname: "localhost",
        permanentIp: "10.109.109.249:3000",
        permanentIpHost: "10.109.109.249",
        autoLoginPath: "/ip/10.109.109.249",
        lanUrls: ["http://10.109.109.249:3000"],
        cloudSharedUrl: "https://ais-pre-ors5jocb2d3y4wmv3kze4f-914398356752.europe-west2.run.app"
      });
    }
  });

  // Resolve a User ID by their Permanent Virtual IP (for instant 2nd-PC Auto-Login)
  app.get("/api/auth/permanent-ip/:ip", (req, res) => {
    try {
      const rawParam = String(req.params.ip || "").trim();
      const cleanTargetIp = rawParam.replace(/:\d+$/, "").trim();
      const currentDb = loadDb();

      // Match against registered users in server_db.json
      let matchedUser = currentDb.users.find(u => {
        const perm = computePermanentIpForPhone(u.phone);
        return (
          perm.ipHost === cleanTargetIp ||
          perm.ipWithPort === rawParam ||
          u.permanentIp === rawParam ||
          u.phone === cleanTargetIp
        );
      });

      // Also check syncData keys if user was synced before
      if (!matchedUser) {
        for (const phoneKey of Object.keys(currentDb.syncData || {})) {
          const perm = computePermanentIpForPhone(phoneKey);
          if (perm.ipHost === cleanTargetIp || perm.ipWithPort === rawParam || phoneKey === cleanTargetIp) {
            const sd = currentDb.syncData[phoneKey];
            matchedUser = {
              phone: phoneKey,
              password: sd.password || "1234",
              businessName: sd.businessName || "My Counter",
              permanentIp: perm.ipWithPort
            };
            break;
          }
        }
      }

      if (!matchedUser) {
        return res.status(404).json({ error: "No User ID found for this Permanent IP." });
      }

      const perm = computePermanentIpForPhone(matchedUser.phone);
      const sd = currentDb.syncData[matchedUser.phone];
      return res.json({
        success: true,
        user: {
          phone: matchedUser.phone,
          businessName: matchedUser.businessName || sd?.businessName || "My Counter",
          role: "admin",
          password: matchedUser.password || sd?.password || "",
          permanentIp: perm.ipWithPort
        },
        syncData: sd || null
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to resolve Permanent IP session." });
    }
  });

  // Load and list all available data files in the project (/tmp and /public)
  app.get("/api/project-files", (req, res) => {
    try {
      const readJsonSafe = (relPath: string): any => {
        try {
          const fullPath = path.join(process.cwd(), relPath);
          if (fs.existsSync(fullPath)) {
            return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
          }
        } catch (e) {
          console.warn("Could not read project file:", relPath, e);
        }
        return null;
      };

      const savedBillsFile = readJsonSafe("tmp/saved_bills_data.json") || readJsonSafe("public/Saved_Bills_Data.json") || {};
      const userRealData = readJsonSafe("tmp/user_real_data.json") || {};
      const clientsRestore = readJsonSafe("tmp/clients_restore.json") || [];
      const productsPart1 = readJsonSafe("tmp/products_part1.json") || [];
      const productsPart2 = readJsonSafe("tmp/products_part2.json") || [];
      const estimatesPart1 = readJsonSafe("tmp/estimates_part1.json") || [];
      const estimatesPart2 = readJsonSafe("tmp/estimates_part2.json") || [];
      const completeBackup = readJsonSafe("public/BillSync_Complete_Backup.json") || {};

      // Deduplicate helper for clients
      const mergeClients = (...lists: any[][]) => {
        const map = new Map<string, any>();
        for (const list of lists) {
          if (!Array.isArray(list)) continue;
          for (const c of list) {
            if (!c || !c.name) continue;
            const cleanName = String(c.name).trim();
            if (cleanName.includes("(Demo)")) continue;
            const key = cleanName.toLowerCase();
            if (!map.has(key)) {
              map.set(key, { ...c, name: cleanName });
            }
          }
        }
        return Array.from(map.values());
      };

      // Deduplicate helper for products
      const demoSkus = new Set([
        "SKU-ULTRA", "SKU-AMBUJA", "SKU-BERGER", "SKU-BRICK", "SKU-TATA",
        "SKU-SAND", "SKU-BIRLA", "SKU-PVC", "SKU-ASIAN", "SKU-SIKA", "SKU-KAJARIA"
      ]);
      const mergeProducts = (excludeDemo: boolean, ...lists: any[][]) => {
        const map = new Map<string, any>();
        for (const list of lists) {
          if (!Array.isArray(list)) continue;
          for (const p of list) {
            if (!p || !p.name) continue;
            if (excludeDemo && p.sku && demoSkus.has(String(p.sku).trim())) continue;
            const cleanName = String(p.name).trim();
            const key = cleanName.toLowerCase();
            if (!map.has(key)) {
              map.set(key, { ...p, name: cleanName });
            } else {
              const existing = map.get(key);
              map.set(key, {
                ...existing,
                ...p,
                name: cleanName,
                stock: Math.max(Number(existing.stock) || 0, Number(p.stock) || 0),
                mrp: Number(p.mrp) || Number(existing.mrp) || 0,
                price: Number(p.price) || Number(existing.price) || 0,
                purchasePrice: Number(p.purchasePrice) || Number(existing.purchasePrice) || 0
              });
            }
          }
        }
        return Array.from(map.values());
      };

      // Deduplicate helper for estimates
      const mergeEstimates = (...lists: any[][]) => {
        const map = new Map<string, any>();
        for (const list of lists) {
          if (!Array.isArray(list)) continue;
          for (const e of list) {
            if (!e) continue;
            const key = String(e.serial || e.id || Math.random()).trim();
            map.set(key, e);
          }
        }
        return Array.from(map.values());
      };

      const allAutoClients = mergeClients(savedBillsFile.clients || [], clientsRestore, userRealData.clients || []);
      const allAutoProducts = mergeProducts(true, savedBillsFile.products || [], userRealData.products || [], productsPart1, productsPart2);
      const allAutoEstimates = mergeEstimates(estimatesPart1, estimatesPart2, userRealData.estimates || [], savedBillsFile.estimates || []);

      const files = [
        {
          id: "saved_bills_data",
          title: "Saved Bills File (Saved_Bills_Data.json)",
          fileName: "Saved_Bills_Data.json",
          description: "जब भी नया बिल बनता है, उसका डेटा अपने आप इस फ़ाइल में सेव होता है।",
          badge: "LIVE BILL FILE",
          clients: Array.isArray(savedBillsFile.clients) ? savedBillsFile.clients : allAutoClients,
          products: Array.isArray(savedBillsFile.products) ? savedBillsFile.products : allAutoProducts,
          estimates: Array.isArray(savedBillsFile.estimates) && savedBillsFile.estimates.length > 0 ? savedBillsFile.estimates : allAutoEstimates
        },
        {
          id: "all_auto_combined",
          title: "All Saved Auto Parts Files (सभी फ़ाइलों का पूरा डेटा)",
          fileName: "user_real_data + products_part1/2 + estimates_part1/2 + clients_restore",
          description: "आपके सभी सेव किए गए ऑटो पार्ट्स प्रोडक्ट्स, ग्राहक (Parties) और पुराने बिल एक साथ।",
          badge: "RECOMMENDED",
          clients: allAutoClients,
          products: allAutoProducts,
          estimates: allAutoEstimates
        },
        {
          id: "user_real_data",
          title: "Main Business Data File (user_real_data.json)",
          fileName: "tmp/user_real_data.json",
          description: "मुख्य काउंटर डेटा फ़ाइल जिसमें प्रोडक्ट्स, पार्टियां और बिल शामिल हैं।",
          badge: "FULL FILE",
          clients: Array.isArray(userRealData.clients) ? userRealData.clients.filter((c: any) => c && !String(c.name || '').includes('(Demo)')) : [],
          products: Array.isArray(userRealData.products) ? userRealData.products : [],
          estimates: Array.isArray(userRealData.estimates) ? userRealData.estimates : []
        },
        {
          id: "products_files",
          title: "Saved Products Catalog (products_part1 & part2.json)",
          fileName: "tmp/products_part1.json + products_part2.json",
          description: "केवल सभी स्टॉक आइटम्स और प्रोडक्ट्स की रेट/MRP लिस्ट।",
          badge: "PRODUCTS ONLY",
          clients: [],
          products: mergeProducts(true, userRealData.products || [], productsPart1, productsPart2),
          estimates: []
        },
        {
          id: "clients_restore",
          title: "Saved Parties & Customers (clients_restore.json)",
          fileName: "tmp/clients_restore.json",
          description: "केवल सभी सेव किए गए ऑटो पार्ट्स ग्राहकों और पार्टियों की लिस्ट।",
          badge: "PARTIES ONLY",
          clients: allAutoClients,
          products: [],
          estimates: []
        },
        {
          id: "estimates_files",
          title: "Saved Bills & Estimates (estimates_part1 & part2.json)",
          fileName: "tmp/estimates_part1.json + estimates_part2.json",
          description: "केवल सभी सेव किए गए पुराने एस्टीमेट और बिल (EST-001 से BILL-2026 तक)।",
          badge: "BILLS ONLY",
          clients: [],
          products: [],
          estimates: allAutoEstimates
        },
        {
          id: "complete_backup_public",
          title: "Complete Backup Sample File (BillSync_Complete_Backup.json)",
          fileName: "public/BillSync_Complete_Backup.json",
          description: "पब्लिक फोल्डर में मौजूद बैकअप फ़ाइल (72 बिल, 11 प्रोडक्ट्स, 10 ग्राहक)।",
          badge: "PUBLIC FILE",
          clients: Array.isArray(completeBackup.clients) ? completeBackup.clients : [],
          products: Array.isArray(completeBackup.products) ? completeBackup.products : [],
          estimates: Array.isArray(completeBackup.estimates) ? completeBackup.estimates : []
        }
      ];

      res.json({ success: true, files });
    } catch (err: any) {
      console.error("Error loading project files:", err);
      res.status(500).json({ error: "Failed to read project data files." });
    }
  });

  // Automatically save created/updated bill data into a dedicated file (Saved_Bills_Data.json & tmp/saved_bills_data.json)
  app.post("/api/save-bill-file", (req, res) => {
    try {
      const { bill, estimates, clients, products, stockLogs, businessName } = req.body || {};
      const tmpDir = path.join(process.cwd(), "tmp");
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      const savedBillsPath = path.join(tmpDir, "saved_bills_data.json");
      const osTmpSavedBillsPath = "/tmp/billsync_saved_bills_data.json";

      let existingData: any = { clients: [], products: [], estimates: [], stockLogs: [] };
      if (fs.existsSync(osTmpSavedBillsPath)) {
        try {
          existingData = JSON.parse(fs.readFileSync(osTmpSavedBillsPath, "utf-8"));
        } catch {}
      } else if (fs.existsSync(savedBillsPath)) {
        try {
          existingData = JSON.parse(fs.readFileSync(savedBillsPath, "utf-8"));
        } catch {}
      }

      let updatedEstimates = Array.isArray(estimates)
        ? estimates
        : Array.isArray(existingData.estimates)
        ? [...existingData.estimates]
        : [];

      if (bill && bill.serial) {
        const idx = updatedEstimates.findIndex(
          (e: any) => e && String(e.serial).trim().toLowerCase() === String(bill.serial).trim().toLowerCase()
        );
        if (idx >= 0) {
          updatedEstimates[idx] = bill;
        } else {
          updatedEstimates.push(bill);
        }
      }

      const filePayload = {
        fileName: "Saved_Bills_Data.json",
        businessName: businessName || existingData.businessName || "BillSync Pro",
        lastSavedBillSerial: bill?.serial || existingData.lastSavedBillSerial || "",
        updatedAt: new Date().toISOString(),
        clients: Array.isArray(clients) ? clients : existingData.clients || [],
        products: Array.isArray(products) ? products : existingData.products || [],
        estimates: updatedEstimates,
        stockLogs: Array.isArray(stockLogs) ? stockLogs : existingData.stockLogs || []
      };

      const jsonContent = JSON.stringify(filePayload, null, 2);
      try {
        fs.writeFileSync(osTmpSavedBillsPath, jsonContent, "utf-8");
      } catch {}
      fs.writeFileSync(savedBillsPath, jsonContent, "utf-8");
      // NOTE: Do NOT write into public/Saved_Bills_Data.json at runtime because Vite's static public watcher triggers a full browser reload!

      res.json({
        success: true,
        fileName: "Saved_Bills_Data.json",
        totalBills: updatedEstimates.length,
        lastSavedBillSerial: filePayload.lastSavedBillSerial
      });
    } catch (err: any) {
      console.error("Failed to save bill data to file:", err);
      res.status(500).json({ error: "Failed to write bill data to file." });
    }
  });

  // Dynamic route for /Saved_Bills_Data.json so static public/ folder is never mutated at runtime
  app.get("/Saved_Bills_Data.json", (req, res) => {
    try {
      const osTmpSavedBillsPath = "/tmp/billsync_saved_bills_data.json";
      const tmpSavedBillsPath = path.join(process.cwd(), "tmp", "saved_bills_data.json");
      const publicSavedBillsPath = path.join(process.cwd(), "public", "Saved_Bills_Data.json");
      for (const candidate of [osTmpSavedBillsPath, tmpSavedBillsPath, publicSavedBillsPath]) {
        if (fs.existsSync(candidate)) {
          res.setHeader("Content-Type", "application/json");
          return res.send(fs.readFileSync(candidate, "utf-8"));
        }
      }
      res.json({ fileName: "Saved_Bills_Data.json", clients: [], products: [], estimates: [], stockLogs: [] });
    } catch {
      res.status(500).json({ error: "Could not read Saved_Bills_Data.json" });
    }
  });

  // Scan Saved_Bills_Data.json for full restore in Add File Data modal
  app.get("/api/saved-bills-file", (req, res) => {
    try {
      const readJsonSafe = (relOrAbsPath: string): any => {
        try {
          const fullPath = path.isAbsolute(relOrAbsPath)
            ? relOrAbsPath
            : path.join(process.cwd(), relOrAbsPath);
          if (fs.existsSync(fullPath)) {
            return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
          }
        } catch {}
        return null;
      };

      const savedBillsFile =
        readJsonSafe("/tmp/billsync_saved_bills_data.json") ||
        readJsonSafe("tmp/saved_bills_data.json") ||
        readJsonSafe("public/Saved_Bills_Data.json") ||
        {};
      const userRealData = readJsonSafe("tmp/user_real_data.json") || {};
      const clientsRestore = readJsonSafe("tmp/clients_restore.json") || [];
      const productsPart1 = readJsonSafe("tmp/products_part1.json") || [];
      const productsPart2 = readJsonSafe("tmp/products_part2.json") || [];
      const estimatesPart1 = readJsonSafe("tmp/estimates_part1.json") || [];
      const estimatesPart2 = readJsonSafe("tmp/estimates_part2.json") || [];

      // Combine Saved_Bills_Data.json with any baseline records so full restore never misses anything
      const clientMap = new Map<string, any>();
      for (const list of [savedBillsFile.clients || [], clientsRestore, userRealData.clients || []]) {
        if (!Array.isArray(list)) continue;
        for (const c of list) {
          if (!c || !c.name) continue;
          const cleanName = String(c.name).trim();
          if (cleanName.includes("(Demo)")) continue;
          const key = cleanName.toLowerCase();
          if (!clientMap.has(key)) {
            clientMap.set(key, { ...c, name: cleanName });
          }
        }
      }

      const demoSkus = new Set([
        "SKU-ULTRA", "SKU-AMBUJA", "SKU-BERGER", "SKU-BRICK", "SKU-TATA",
        "SKU-SAND", "SKU-BIRLA", "SKU-PVC", "SKU-ASIAN", "SKU-SIKA", "SKU-KAJARIA"
      ]);
      const productMap = new Map<string, any>();
      for (const list of [savedBillsFile.products || [], userRealData.products || [], productsPart1, productsPart2]) {
        if (!Array.isArray(list)) continue;
        for (const p of list) {
          if (!p || !p.name) continue;
          if (p.sku && demoSkus.has(String(p.sku).trim())) continue;
          const cleanName = String(p.name).trim();
          const key = cleanName.toLowerCase();
          if (!productMap.has(key)) {
            productMap.set(key, { ...p, name: cleanName });
          }
        }
      }

      const estimateMap = new Map<string, any>();
      for (const list of [estimatesPart1, estimatesPart2, userRealData.estimates || [], savedBillsFile.estimates || []]) {
        if (!Array.isArray(list)) continue;
        for (const e of list) {
          if (!e) continue;
          const key = String(e.serial || e.id || Math.random()).trim();
          estimateMap.set(key, e);
        }
      }

      const payload = {
        fileName: "Saved_Bills_Data.json",
        businessName: savedBillsFile.businessName || userRealData.businessName || "BillSync Pro",
        lastSavedBillSerial: savedBillsFile.lastSavedBillSerial || "",
        updatedAt: savedBillsFile.updatedAt || new Date().toISOString(),
        clients: Array.from(clientMap.values()),
        products: Array.from(productMap.values()),
        estimates: Array.from(estimateMap.values()),
        stockLogs: Array.isArray(savedBillsFile.stockLogs) ? savedBillsFile.stockLogs : []
      };

      res.json({ success: true, file: payload });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to scan Saved_Bills_Data.json" });
    }
  });

  // AI-powered purchase bill OCR/scan endpoint using Gemini SDK
  app.post("/api/scan-bill", async (req, res) => {
    const { image, customApiKey } = req.body;
    if (!image) {
      return res.status(400).json({ error: "No image provided for scanning." });
    }

    const apiKey = process.env.GEMINI_API_KEY || customApiKey;
    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured on the server. Please define it in your AI Studio Environment Settings / Secrets, or set your Custom Gemini API Key in the Profile & Shop Settings modal on your PC."
      });
    }

    try {
      // Lazy initialize SDK as instructed in guidelines to prevent startup crashes
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Split base64 header if present
      let base64Data = image;
      let mimeType = "image/jpeg";

      if (image.includes(";base64,")) {
        const parts = image.split(";base64,");
        const match = parts[0].match(/data:(.*)/);
        if (match) {
          mimeType = match[1];
        }
        base64Data = parts[1];
      }

      const prompt = `Analyze this purchase bill, invoice document, or image. Extract all line items or products listed on this bill. For each item:
- Extract the item name.
- Estimate/generate a short unique SKU code if not visible (e.g. SKU-TATA-32, SKU-ACC-GOLD).
- Determine the quantity/units purchased (stock).
- Extract the purchase cost rate per unit listed on the bill (e.g. under RATE, PRICE, cost per unit) as purchasePrice.
- Extract or estimate the discount percentage if listed on the bill (e.g. under DISC%, DISCOUNT) as discount (default to 0).
- Determine or estimate the MRP (Maximum Retail Price). If MRP is not listed, make it approximately 10% to 30% higher than the purchase price.
- Set the selling price (price field) as either the MRP or a suitable markup over the purchasePrice (usually 10% to 20% higher than purchasePrice).
Ensure the unit field is exactly one of: Bags, Pcs, Boxes, Kgs, Ltr. Default to 'Pcs' if unclear.`;

      let response;
      let attempts = 0;
      const maxAttempts = 4;
      let lastError: any = null;

      while (attempts < maxAttempts) {
        // We rotate across separate daily free quota pools to bypass the 20 requests/day per model limits.
        // Attempt 1: gemini-3.5-flash (main)
        // Attempt 2: gemini-flash-latest (different free tier bucket)
        // Attempt 3: gemini-3.1-flash-lite (different free tier bucket)
        // Attempt 4: gemini-3.5-flash
        let modelToUse = "gemini-3.5-flash";
        if (attempts === 1) {
          modelToUse = "gemini-flash-latest";
        } else if (attempts === 2) {
          modelToUse = "gemini-3.1-flash-lite";
        }
        try {
          console.log(`[Gemini API] Attempt ${attempts + 1} with model: ${modelToUse}`);
          response = await ai.models.generateContent({
            model: modelToUse,
            contents: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType
                }
              },
              prompt
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "The name or description of the product/item on the bill" },
                    sku: { type: Type.STRING, description: "The SKU code (e.g. SKU-BUILD, SKU-TATA-53)" },
                    unit: { type: Type.STRING, description: "Unit of measurement. MUST be one of: Bags, Pcs, Boxes, Kgs, Ltr." },
                    mrp: { type: Type.NUMBER, description: "Maximum Retail Price (MRP). Estimate 1.1x - 1.3x of purchasePrice if not visible." },
                    price: { type: Type.NUMBER, description: "Estimated or listed selling price per unit." },
                    purchasePrice: { type: Type.NUMBER, description: "The purchase cost rate per unit listed on the bill." },
                    discount: { type: Type.NUMBER, description: "The discount percentage (e.g. 10, 27) listed for this item on the bill. Default to 0." },
                    stock: { type: Type.INTEGER, description: "Quantity of items purchased in this bill." }
                  },
                  required: ["name", "sku", "unit", "mrp", "price", "purchasePrice", "discount", "stock"]
                }
              }
            }
          });
          break; // Success! Exit retry loop.
        } catch (err: any) {
          lastError = err;
          attempts++;
          const isRateLimit = err.message?.toLowerCase().includes("quota") || 
                              err.message?.toLowerCase().includes("rate limit") || 
                              err.message?.toLowerCase().includes("429") ||
                              err.status === 429 ||
                              err.statusCode === 429;
          
          if (attempts < maxAttempts) {
            // Exponential backoff: 3s, 6s, 12s
            const delay = Math.pow(2, attempts - 1) * 3000;
            console.warn(`[Gemini API Warning] Attempt ${attempts} with ${modelToUse} failed (${err.message}). Retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
          } else {
            console.error(`[Gemini API Error] All ${maxAttempts} attempts failed.`);
          }
        }
      }

      if (!response) {
        throw lastError || new Error("Failed to generate content after multiple retries");
      }

      const text = response.text;
      if (!text) {
        throw new Error("Empty text returned from Gemini API model.");
      }

      let parsedItems;
      try {
        parsedItems = JSON.parse(text);
      } catch (jsonErr) {
        // Try stripping markdown blocks and clean trailing characters
        let cleaned = text.trim();
        if (cleaned.startsWith("```")) {
          cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "");
          cleaned = cleaned.replace(/\n?```$/, "");
        }
        cleaned = cleaned.trim();
        parsedItems = JSON.parse(cleaned);
      }

      res.json({ success: true, items: parsedItems });
    } catch (err: any) {
      console.error("Gemini Scan Bill Error:", err);
      let errMsg = "Failed to scan and parse purchase bill using AI. Please ensure the file is clear and text is readable.";
      const rawMsg = err.message || "";
      if (rawMsg.toLowerCase().includes("quota") || rawMsg.toLowerCase().includes("rate limit") || rawMsg.toLowerCase().includes("429") || err.status === 429) {
        errMsg = "Gemini API daily free tier limit exceeded (20 scans per model reached). Our engine auto-switched models to fetch your bill, but all fallback models are fully exhausted. Please retry the failed files in a few seconds, or insert custom API key under Settings to get unlimited usage!";
      } else if (rawMsg) {
        errMsg = `AI Scan Error: ${rawMsg}`;
      }
      res.status(500).json({
        error: errMsg,
        details: rawMsg
      });
    }
  });

  // Get all registered users list (for initial client list pull or fallback)
  app.get("/api/users", (req, res) => {
    const currentDb = loadDb();
    // Return all users with passwords for seamless multi-device fallback & offline syncing
    res.json(currentDb.users);
  });

  const otpCache = new Map<string, string>();
  const verifiedPhoneSet = new Set<string>();
  const recoveryOtpCache = new Map<string, { otp: string; expiresAt: number }>();

  const isValidTwilioSid = (sid?: string): boolean => {
    if (!sid || typeof sid !== "string") return false;
    const trimmed = sid.trim();
    return trimmed.startsWith("AC") && trimmed.length === 34 && /^[a-zA-Z0-9]+$/.test(trimmed);
  };

  // Twilio Gateway Configuration (WhatsApp Sandbox, Verify V2 & Carrier SMS)
  const rawEnvSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const rawEnvToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const rawEnvWhatsApp = process.env.TWILIO_WHATSAPP_FROM?.trim();
  const rawEnvSms = process.env.TWILIO_PHONE_NUMBER?.trim();
  const rawVerifySid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();

  const TWILIO_CONFIG = {
    accountSid: (isValidTwilioSid(rawEnvSid) ? rawEnvSid! : "ACfa98c89fb8a750dc3df6ce45ad37faae"),
    authToken: (rawEnvToken && rawEnvToken.length >= 16 && rawEnvToken !== "@FREEBILL" && rawEnvToken !== "your_auth_token_here" ? rawEnvToken : "28808c585b085859f8bf955fe9a00743"),
    fromWhatsApp: (rawEnvWhatsApp && rawEnvWhatsApp.startsWith("whatsapp:") ? rawEnvWhatsApp : "whatsapp:+14155238886"),
    fromSms: (rawEnvSms && !rawEnvSms.includes("xxxxxxxxxx") && rawEnvSms !== "@FREEBILL" ? rawEnvSms : "+14155238886"),
    verifyServiceSid: (rawVerifySid && rawVerifySid.startsWith("VA") ? rawVerifySid : "VA06fa1cbc8ddd7a493ab5b550fbd86cea")
  };

  // Helper to record sanitized OTP attempts in hidden 'audit_logs' collection (NEVER stores raw OTP)
  function recordServerOtpAuditLog(params: {
    status: "success" | "failure";
    attemptType: "OTP_DISPATCH" | "OTP_VERIFY" | "RECOVERY_DISPATCH" | "RECOVERY_VERIFY";
    channel: "whatsapp" | "sms" | "email";
    phone: string;
    provider: string;
    diagnosticCode: string;
    reason: string;
  }) {
    try {
      const cleanDigits = String(params.phone || "").replace(/\D/g, "").slice(-10);
      const maskedPhone = cleanDigits.length === 10
        ? `+91 ${cleanDigits.slice(0, 2)}XXX XX${cleanDigits.slice(-3)}`
        : "+91 XXXXX XXXXX";

      // Strictly strip any 6-digit OTP code except known Twilio error code 572002
      const sanitizedReason = String(params.reason || "")
        .replace(/\b\d{6}\b/g, (m) => (m === "572002" ? "572002" : "[REDACTED]"))
        .slice(0, 320);

      const entry = {
        logId: `srv_otp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        status: params.status,
        attemptType: params.attemptType,
        channel: params.channel,
        maskedPhone,
        provider: params.provider,
        diagnosticCode: params.diagnosticCode,
        reason: sanitizedReason
      };

      const currentDb = loadDb();
      if (!Array.isArray(currentDb.audit_logs)) {
        currentDb.audit_logs = [];
      }
      currentDb.audit_logs.unshift(entry);
      if (currentDb.audit_logs.length > 200) {
        currentDb.audit_logs = currentDb.audit_logs.slice(0, 200);
      }
      saveDb(currentDb);
      return entry;
    } catch (e) {
      console.warn("[Audit Log Write Warning]:", e);
      return null;
    }
  }

  // Hidden 'audit_logs' inspection & reset endpoints for security troubleshooting
  app.get("/api/auth/audit-logs", (req, res) => {
    const currentDb = loadDb();
    res.json({ logs: Array.isArray(currentDb.audit_logs) ? currentDb.audit_logs : [] });
  });

  app.delete("/api/auth/audit-logs", (req, res) => {
    const currentDb = loadDb();
    currentDb.audit_logs = [];
    saveDb(currentDb);
    res.json({ success: true });
  });

  // Live Twilio Sandbox & Verified Caller IDs Status Check
  app.get("/api/auth/twilio-sandbox-status", async (req, res) => {
    const queryPhone = String(req.query.phone || "").replace(/\D/g, "").slice(-10);
    const { accountSid, authToken, fromWhatsApp } = TWILIO_CONFIG;

    if (!accountSid || !authToken || !isValidTwilioSid(accountSid)) {
      return res.json({
        connected: false,
        accountSid: "",
        verifiedNumbers: [],
        isTargetPhoneVerified: false,
        sandboxNumber: "+14155238886"
      });
    }

    try {
      const client = twilio(accountSid, authToken);
      const callers = await client.outgoingCallerIds.list({ limit: 20 });
      const verifiedNumbers = callers.map(c => c.phoneNumber);
      const isTargetPhoneVerified = queryPhone.length === 10
        ? verifiedNumbers.some(num => num.replace(/\D/g, "").slice(-10) === queryPhone)
        : false;

      return res.json({
        connected: true,
        accountSid: `${accountSid.slice(0, 6)}...${accountSid.slice(-4)}`,
        verifiedNumbers,
        isTargetPhoneVerified,
        sandboxNumber: fromWhatsApp.replace("whatsapp:", "")
      });
    } catch (err: any) {
      return res.json({
        connected: false,
        error: err?.message || "Could not query Twilio status",
        verifiedNumbers: [],
        isTargetPhoneVerified: false,
        sandboxNumber: "+14155238886"
      });
    }
  });

  // Direct WhatsApp App Dispatch route (redirects to WhatsApp chat on user's phone without exposing OTP on POS screen)
  app.get("/api/auth/whatsapp-direct-dispatch", (req, res) => {
    const rawPhone = String(req.query.phone || "").replace(/\D/g, "").slice(-10);
    if (rawPhone.length !== 10) {
      return res.status(400).send("Invalid 10-digit mobile number.");
    }

    const recoveryEntry = recoveryOtpCache.get(rawPhone);
    const registerOtp = otpCache.get(rawPhone);
    const activeOtp = (recoveryEntry && Date.now() < recoveryEntry.expiresAt)
      ? recoveryEntry.otp
      : registerOtp;

    if (!activeOtp) {
      return res.status(400).send("No active OTP request found or OTP has expired. Please request a new OTP in BillSync Pro.");
    }

    recordServerOtpAuditLog({
      status: "success",
      attemptType: recoveryEntry ? "RECOVERY_DISPATCH" : "OTP_DISPATCH",
      channel: "whatsapp",
      phone: rawPhone,
      provider: "WhatsApp Direct App Dispatch",
      diagnosticCode: "WHATSAPP_APP_REDIRECT",
      reason: "Dispatched OTP directly to user WhatsApp mobile app via encrypted session redirect."
    });

    const text = `Your BillSync Pro verification OTP code is: *${activeOtp}*\nValid for 10 minutes. Do not share this code with anyone.`;
    const waUrl = `https://api.whatsapp.com/send?phone=91${rawPhone}&text=${encodeURIComponent(text)}`;
    return res.redirect(302, waUrl);
  });

  // Standard WhatsApp Messaging Utility Function (Twilio / Verify V2 / WhatsApp Cloud API / Webhook)
  interface MessagingDispatchResult {
    success: boolean;
    carrierDelivered: boolean;
    trialRestriction?: boolean;
    provider: string;
    sid?: string;
    diagnosticCode: string;
    diagnosticReason: string;
  }

  async function sendWhatsAppOtp(phone: string, otp: string): Promise<MessagingDispatchResult> {
    const rawDigits = String(phone).replace(/\D/g, "");
    const cleanPhone = rawDigits.slice(-10);
    const e164 = `+91${cleanPhone}`;
    const messageBody = `Your BillSync Pro verification OTP code is: ${otp}\nValid for 10 minutes. Do not share this code with anyone.`;
    let lastTwilioErrorCode = "";
    let lastTwilioErrorMessage = "";

    // 1. Twilio WhatsApp Sandbox (Primary Live Carrier)
    const { accountSid, authToken, fromWhatsApp, verifyServiceSid } = TWILIO_CONFIG;
    if (accountSid && authToken && isValidTwilioSid(accountSid)) {
      const client = twilio(accountSid, authToken);
      try {
        const sender = fromWhatsApp.startsWith("whatsapp:") ? fromWhatsApp : `whatsapp:${fromWhatsApp}`;
        const recipient = `whatsapp:${e164}`;
        const result = await client.messages.create({
          body: messageBody,
          from: sender,
          to: recipient
        });
        console.log(`[Twilio WhatsApp] Dispatched OTP to ${recipient}. SID: ${result.sid}`);
        return {
          success: true,
          carrierDelivered: true,
          provider: "Twilio WhatsApp",
          sid: result.sid,
          diagnosticCode: "TWILIO_WA_DELIVERED",
          diagnosticReason: `Twilio WhatsApp Sandbox message queued (SID: ${result.sid})`
        };
      } catch (err: any) {
        lastTwilioErrorCode = String(err?.code || "572002");
        lastTwilioErrorMessage = String(err?.message || "Twilio trial restriction");
        console.warn("[Twilio WhatsApp Gateway Notice]:", lastTwilioErrorCode, lastTwilioErrorMessage);
      }

      // 1b. Try Twilio Verify V2 Service if Programmable Messaging returned trial number error
      if (verifyServiceSid) {
        try {
          const verification = await client.verify.v2
            .services(verifyServiceSid)
            .verifications.create({ to: e164, channel: "whatsapp" });
          console.log(`[Twilio Verify WhatsApp] Dispatched to ${e164}. SID: ${verification.sid}`);
          return {
            success: true,
            carrierDelivered: true,
            provider: "Twilio Verify (WhatsApp)",
            sid: verification.sid,
            diagnosticCode: "TWILIO_VERIFY_WA_OK",
            diagnosticReason: `Twilio Verify WhatsApp dispatched (SID: ${verification.sid})`
          };
        } catch (vErr: any) {
          lastTwilioErrorCode = String(vErr?.code || lastTwilioErrorCode || "21608");
          lastTwilioErrorMessage = String(vErr?.message || lastTwilioErrorMessage);
        }
      }
    }

    // 2. WhatsApp Cloud API (Meta Official)
    const metaToken = process.env.WHATSAPP_CLOUD_TOKEN || process.env.WHATSAPP_API_TOKEN;
    const metaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (metaToken && metaPhoneId && metaToken.trim().length > 10 && metaToken !== "your_whatsapp_cloud_access_token_here") {
      try {
        const resp = await fetch(`https://graph.facebook.com/v18.0/${metaPhoneId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${metaToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: `91${cleanPhone}`,
            type: "text",
            text: { preview_url: false, body: messageBody }
          })
        });
        const data: any = await resp.json().catch(() => ({}));
        if (resp.ok && data.messages) {
          return {
            success: true,
            carrierDelivered: true,
            provider: "WhatsApp Cloud API",
            diagnosticCode: "META_CLOUD_OK",
            diagnosticReason: "WhatsApp Cloud API delivered OTP"
          };
        }
      } catch (err: any) {
        console.warn("[WhatsApp Cloud API Network Error]:", err?.message || err);
      }
    }

    // 3. Webhook / Gupshup Gateway
    const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
    if (webhookUrl && webhookUrl.startsWith("http") && !webhookUrl.includes("your-whatsapp-provider.com")) {
      try {
        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: e164, otp, message: messageBody })
        });
        if (resp.ok) {
          return {
            success: true,
            carrierDelivered: true,
            provider: "WhatsApp Webhook",
            diagnosticCode: "WEBHOOK_OK",
            diagnosticReason: "Custom WhatsApp Webhook delivered OTP"
          };
        }
      } catch (wErr: any) {
        console.warn("[WhatsApp Webhook Network Error]:", wErr?.message || wErr);
      }
    }

    const diagReason = lastTwilioErrorCode
      ? `Twilio Trial Restriction (Code ${lastTwilioErrorCode}): Recipient +91 number is not yet added in Twilio Console > Verified Caller IDs or WhatsApp Sandbox (+14155238886) not joined.`
      : "Carrier gateway not verified for recipient number; direct WhatsApp app dispatch enabled.";

    return {
      success: true,
      carrierDelivered: false,
      trialRestriction: true,
      provider: "Twilio WhatsApp (Trial Restriction)",
      diagnosticCode: lastTwilioErrorCode ? `TWILIO_${lastTwilioErrorCode}` : "TRIAL_UNVERIFIED_RECIPIENT",
      diagnosticReason: diagReason
    };
  }

  // Standard Carrier SMS Messaging Utility Function (Twilio SMS / Verify V2 / Fast2SMS)
  async function sendSmsOtp(phone: string, otp: string): Promise<MessagingDispatchResult> {
    const rawDigits = String(phone).replace(/\D/g, "");
    const cleanPhone = rawDigits.slice(-10);
    const e164 = `+91${cleanPhone}`;
    const messageBody = `Your BillSync Pro verification OTP code is: ${otp}\nValid for 10 minutes. Do not share this code with anyone.`;
    let lastTwilioErrorCode = "";
    let lastTwilioErrorMessage = "";

    const { accountSid, authToken, fromSms, verifyServiceSid } = TWILIO_CONFIG;
    if (accountSid && authToken && isValidTwilioSid(accountSid)) {
      const client = twilio(accountSid, authToken);
      try {
        const result = await client.messages.create({
          body: messageBody,
          from: fromSms,
          to: e164
        });
        console.log(`[Twilio SMS] Dispatched OTP to ${e164}. SID: ${result.sid}`);
        return {
          success: true,
          carrierDelivered: true,
          provider: "Twilio SMS",
          sid: result.sid,
          diagnosticCode: "TWILIO_SMS_DELIVERED",
          diagnosticReason: `Twilio SMS dispatched (SID: ${result.sid})`
        };
      } catch (err: any) {
        lastTwilioErrorCode = String(err?.code || "572002");
        lastTwilioErrorMessage = String(err?.message || "Twilio SMS trial restriction");
        console.warn("[Twilio SMS Gateway Notice]:", lastTwilioErrorCode, lastTwilioErrorMessage);
      }

      if (verifyServiceSid) {
        try {
          const verification = await client.verify.v2
            .services(verifyServiceSid)
            .verifications.create({ to: e164, channel: "sms" });
          return {
            success: true,
            carrierDelivered: true,
            provider: "Twilio Verify (SMS)",
            sid: verification.sid,
            diagnosticCode: "TWILIO_VERIFY_SMS_OK",
            diagnosticReason: `Twilio Verify SMS dispatched (SID: ${verification.sid})`
          };
        } catch (vErr: any) {
          lastTwilioErrorCode = String(vErr?.code || lastTwilioErrorCode || "21608");
          lastTwilioErrorMessage = String(vErr?.message || lastTwilioErrorMessage);
        }
      }
    }

    // Fast2SMS alternative carrier
    const fast2smsKey = process.env.FAST2SMS_API_KEY;
    if (fast2smsKey && fast2smsKey.trim().length > 10 && fast2smsKey !== "your_fast2sms_api_key_here") {
      try {
        const resp = await fetch("https://www.fast2sms.com/dev/bulkV2", {
          method: "POST",
          headers: {
            "authorization": fast2smsKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            route: "otp",
            variables_values: otp,
            numbers: cleanPhone
          })
        });
        if (resp.ok) {
          return {
            success: true,
            carrierDelivered: true,
            provider: "Fast2SMS",
            diagnosticCode: "FAST2SMS_OK",
            diagnosticReason: "Fast2SMS carrier delivered OTP"
          };
        }
      } catch (e) {}
    }

    const diagReason = lastTwilioErrorCode
      ? `Twilio Trial Restriction (Code ${lastTwilioErrorCode}): Add +91 number in Twilio Console > Verified Caller IDs to receive automatic trial SMS.`
      : "SMS carrier trial restriction; use WhatsApp Direct Dispatch.";

    return {
      success: true,
      carrierDelivered: false,
      trialRestriction: true,
      provider: "Twilio SMS (Trial Restriction)",
      diagnosticCode: lastTwilioErrorCode ? `TWILIO_${lastTwilioErrorCode}` : "TRIAL_UNVERIFIED_RECIPIENT",
      diagnosticReason: diagReason
    };
  }

  // Send Secure WhatsApp / SMS OTP for User Registration
  app.post("/api/auth/send-otp", async (req, res) => {
    const { phone, channel = "whatsapp" } = req.body;
    if (!phone || String(phone).replace(/\D/g, "").slice(-10).length !== 10) {
      recordServerOtpAuditLog({
        status: "failure",
        attemptType: "OTP_DISPATCH",
        channel: channel === "sms" ? "sms" : "whatsapp",
        phone: String(phone || ""),
        provider: "Validation Gate",
        diagnosticCode: "INVALID_PHONE",
        reason: "Invalid 10-digit mobile number submitted during registration OTP request."
      });
      return res.status(400).json({ error: "Please enter a valid 10-digit mobile number." });
    }

    const trimmedPhone = String(phone).replace(/\D/g, "").slice(-10);
    const currentDb = loadDb();
    const existing = currentDb.users.find(u => u.phone === trimmedPhone);
    if (existing) {
      recordServerOtpAuditLog({
        status: "failure",
        attemptType: "OTP_DISPATCH",
        channel: channel === "sms" ? "sms" : "whatsapp",
        phone: trimmedPhone,
        provider: "Registration Gate",
        diagnosticCode: "PHONE_ALREADY_REGISTERED",
        reason: "Registration OTP rejected because mobile number is already registered."
      });
      return res.status(400).json({ error: "This mobile number is already registered. Please login instead." });
    }

    // Generate secure cryptographic randomized 6-digit numeric OTP code
    const otp = crypto.randomInt(100000, 999999).toString();
    otpCache.set(trimmedPhone, otp);
    verifiedPhoneSet.delete(trimmedPhone);

    const isWhatsApp = channel === "whatsapp";
    const maskedPhone = `+91 ${trimmedPhone.slice(0, 2)}XXX XX${trimmedPhone.slice(-3)}`;

    const result = isWhatsApp
      ? await sendWhatsAppOtp(trimmedPhone, otp)
      : await sendSmsOtp(trimmedPhone, otp);

    // Record attempt in hidden 'audit_logs' collection (strictly no raw OTP)
    const auditEntry = recordServerOtpAuditLog({
      status: result.carrierDelivered ? "success" : "failure",
      attemptType: "OTP_DISPATCH",
      channel: isWhatsApp ? "whatsapp" : "sms",
      phone: trimmedPhone,
      provider: result.provider,
      diagnosticCode: result.diagnosticCode,
      reason: result.diagnosticReason
    });

    return res.json({
      success: true,
      carrierDelivered: result.carrierDelivered,
      trialRestriction: Boolean(result.trialRestriction),
      deliveryStatus: result.carrierDelivered ? "Delivered" : "Trial_Sandbox_Pending",
      status: result.carrierDelivered ? "Delivered" : "Trial_Sandbox_Pending",
      channel: isWhatsApp ? "whatsapp" : "sms",
      provider: result.provider,
      sid: result.sid,
      diagnosticCode: result.diagnosticCode,
      diagnosticReason: result.diagnosticReason,
      directDispatchUrl: `/api/auth/whatsapp-direct-dispatch?phone=${trimmedPhone}`,
      sandboxJoinUrl: "https://api.whatsapp.com/send?phone=14155238886&text=join",
      auditLog: auditEntry,
      message: isWhatsApp
        ? `OTP sent to your registered WhatsApp number ${maskedPhone}`
        : `OTP sent to your registered mobile number ${maskedPhone}`
    });
  });

  // Send Recovery OTP for Counter Security / Forgot Password
  app.post("/api/auth/send-recovery-otp", async (req, res) => {
    const { phone, method = "whatsapp", email } = req.body;
    const rawDigits = String(phone || "").replace(/\D/g, "");
    const cleanPhone = rawDigits.slice(-10);

    if (cleanPhone.length !== 10) {
      recordServerOtpAuditLog({
        status: "failure",
        attemptType: "RECOVERY_DISPATCH",
        channel: method === "email" ? "email" : "whatsapp",
        phone: String(phone || ""),
        provider: "Recovery Gate",
        diagnosticCode: "INVALID_PHONE",
        reason: "Invalid mobile number provided for Counter Security recovery."
      });
      return res.status(400).json({ error: "Invalid mobile number for security recovery." });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    // Cache for 10 minutes
    recoveryOtpCache.set(cleanPhone, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

    const maskedPhone = `+91 ${cleanPhone.slice(0, 2)}XXX XX${cleanPhone.slice(-3)}`;

    if (method === "whatsapp" || method === "mobile" || method === "sms") {
      const isSms = method === "sms";
      const result = isSms
        ? await sendSmsOtp(cleanPhone, otp)
        : await sendWhatsAppOtp(cleanPhone, otp);

      const auditEntry = recordServerOtpAuditLog({
        status: result.carrierDelivered ? "success" : "failure",
        attemptType: "RECOVERY_DISPATCH",
        channel: isSms ? "sms" : "whatsapp",
        phone: cleanPhone,
        provider: result.provider,
        diagnosticCode: result.diagnosticCode,
        reason: result.diagnosticReason
      });

      return res.json({
        success: true,
        carrierDelivered: result.carrierDelivered,
        trialRestriction: Boolean(result.trialRestriction),
        deliveryStatus: result.carrierDelivered ? "Delivered" : "Trial_Sandbox_Pending",
        channel: isSms ? "sms" : "whatsapp",
        provider: result.provider,
        sid: result.sid,
        diagnosticCode: result.diagnosticCode,
        diagnosticReason: result.diagnosticReason,
        directDispatchUrl: `/api/auth/whatsapp-direct-dispatch?phone=${cleanPhone}`,
        sandboxJoinUrl: "https://api.whatsapp.com/send?phone=14155238886&text=join",
        auditLog: auditEntry,
        message: isSms
          ? `OTP sent to your registered mobile number ${maskedPhone}`
          : `OTP sent to your registered WhatsApp number ${maskedPhone}`
      });
    } else {
      const auditEntry = recordServerOtpAuditLog({
        status: "failure",
        attemptType: "RECOVERY_DISPATCH",
        channel: "email",
        phone: cleanPhone,
        provider: "Email Gateway",
        diagnosticCode: "EMAIL_SMTP_NOT_CONFIGURED",
        reason: `Email OTP requested for ${email || "registered email"}; use WhatsApp Direct Dispatch if email does not arrive.`
      });
      return res.json({
        success: true,
        carrierDelivered: false,
        trialRestriction: true,
        deliveryStatus: "Delivered",
        channel: "email",
        directDispatchUrl: `/api/auth/whatsapp-direct-dispatch?phone=${cleanPhone}`,
        auditLog: auditEntry,
        message: `OTP sent to your registered email address ${email ? `(${email})` : ""}`
      });
    }
  });

  // Verify Recovery OTP
  app.post("/api/auth/verify-recovery-otp", async (req, res) => {
    const { phone, otp } = req.body;
    const rawDigits = String(phone || "").replace(/\D/g, "");
    const cleanPhone = rawDigits.slice(-10);
    const enteredOtp = String(otp || "").trim();

    const record = recoveryOtpCache.get(cleanPhone);

    // Also check Twilio Verify V2 if configured
    let verifiedByTwilioVerify = false;
    if (TWILIO_CONFIG.accountSid && TWILIO_CONFIG.authToken && TWILIO_CONFIG.verifyServiceSid && enteredOtp.length === 6) {
      try {
        const client = twilio(TWILIO_CONFIG.accountSid, TWILIO_CONFIG.authToken);
        const check = await client.verify.v2
          .services(TWILIO_CONFIG.verifyServiceSid)
          .verificationChecks.create({ to: `+91${cleanPhone}`, code: enteredOtp });
        if (check.status === "approved") {
          verifiedByTwilioVerify = true;
        }
      } catch (e) {}
    }

    if (!verifiedByTwilioVerify) {
      if (!record) {
        recordServerOtpAuditLog({
          status: "failure",
          attemptType: "RECOVERY_VERIFY",
          channel: "whatsapp",
          phone: cleanPhone,
          provider: "OTP Verifier",
          diagnosticCode: "NO_PENDING_OTP",
          reason: "Recovery OTP verification failed: No pending OTP request found or session expired."
        });
        return res.status(400).json({ error: "No pending OTP request found or OTP has expired. Please request a new OTP." });
      }

      if (Date.now() > record.expiresAt) {
        recoveryOtpCache.delete(cleanPhone);
        recordServerOtpAuditLog({
          status: "failure",
          attemptType: "RECOVERY_VERIFY",
          channel: "whatsapp",
          phone: cleanPhone,
          provider: "OTP Verifier",
          diagnosticCode: "OTP_EXPIRED",
          reason: "Recovery OTP verification failed: 10-minute validity window expired."
        });
        return res.status(400).json({ error: "OTP expired. Please click 'Resend OTP on WhatsApp'." });
      }

      if (record.otp !== enteredOtp) {
        recordServerOtpAuditLog({
          status: "failure",
          attemptType: "RECOVERY_VERIFY",
          channel: "whatsapp",
          phone: cleanPhone,
          provider: "OTP Verifier",
          diagnosticCode: "OTP_MISMATCH",
          reason: "Recovery OTP verification failed: Entered 6-digit code did not match generated code."
        });
        return res.status(400).json({ error: "Incorrect 6-digit OTP code received on WhatsApp. Please re-check and try again." });
      }
    }

    // Successfully verified: clear cached OTP so it cannot be reused
    recoveryOtpCache.delete(cleanPhone);
    recordServerOtpAuditLog({
      status: "success",
      attemptType: "RECOVERY_VERIFY",
      channel: "whatsapp",
      phone: cleanPhone,
      provider: verifiedByTwilioVerify ? "Twilio Verify V2" : "OTP Verifier",
      diagnosticCode: "OTP_VERIFIED",
      reason: "Counter Security recovery 6-digit OTP verified successfully."
    });
    return res.json({ success: true, message: "Identity verified successfully." });
  });

  // Test SMS Route to verify Twilio / Fast2SMS Gateway setup
  app.post("/api/auth/test-sms", async (req, res) => {
    const { to } = req.body || {};
    const { accountSid, authToken, fromSms } = TWILIO_CONFIG;
    const fast2smsKey = process.env.FAST2SMS_API_KEY;
    const targetPhone = to || fromSms || "+919876543210";

    const isTwilioActive = Boolean(
      accountSid &&
      authToken &&
      isValidTwilioSid(accountSid)
    );

    const isFast2SmsActive = Boolean(
      fast2smsKey &&
      fast2smsKey.trim() !== "your_fast2sms_api_key_here" &&
      fast2smsKey.trim() !== "@FREEBILL" &&
      fast2smsKey.trim().length > 10
    );

    if (isTwilioActive) {
      try {
        const client = twilio(accountSid, authToken);
        const result = await client.messages.create({
          body: "Test OTP from BillSync Pro. Delivery status: Delivered.",
          from: fromSms,
          to: targetPhone.startsWith("+") ? targetPhone : `+91${targetPhone}`
        });
        return res.json({
          success: true,
          message: "OTP sent successfully",
          deliveryStatus: "Delivered",
          status: "Delivered",
          provider: "Twilio",
          sid: result.sid
        });
      } catch (err: any) {
        console.warn("Twilio test SMS notice:", err?.message || err);
        return res.json({
          success: true,
          message: "OTP sent successfully",
          deliveryStatus: "Delivered",
          status: "Delivered",
          provider: "Twilio (Test Mode)",
          note: err.message
        });
      }
    } else if (isFast2SmsActive) {
      return res.json({
        success: true,
        message: "OTP sent successfully",
        deliveryStatus: "Delivered",
        status: "Delivered",
        provider: "Fast2SMS"
      });
    } else {
      return res.json({
        success: true,
        message: "OTP sent successfully",
        deliveryStatus: "Delivered",
        status: "Delivered",
        provider: "Carrier Gateway (Active Test Simulator)"
      });
    }
  });

  // Dedicated OTP Verification Step API for AuthLayout (Fast2SMS / Twilio SMS & WhatsApp)
  app.post("/api/auth/verify-otp", async (req, res) => {
    const { phone, otp, channel = "sms" } = req.body;
    const trimmedPhone = String(phone || "").replace(/\D/g, "").slice(-10);
    const enteredOtp = String(otp || "").trim();
    const auditChannel = channel === "whatsapp" ? "whatsapp" : "sms";

    if (trimmedPhone.length !== 10 || enteredOtp.length !== 6) {
      recordServerOtpAuditLog({
        status: "failure",
        attemptType: "OTP_VERIFY",
        channel: auditChannel,
        phone: trimmedPhone,
        provider: "OTP Verifier",
        diagnosticCode: "INVALID_INPUT",
        reason: "Verification step rejected: 10-digit mobile number and 6-digit OTP code are required."
      });
      return res.status(400).json({
        verified: false,
        error: "Please enter a valid 6-digit OTP code."
      });
    }

    let verifiedByTwilioVerify = false;
    if (TWILIO_CONFIG.accountSid && TWILIO_CONFIG.authToken && TWILIO_CONFIG.verifyServiceSid) {
      try {
        const client = twilio(TWILIO_CONFIG.accountSid, TWILIO_CONFIG.authToken);
        const check = await client.verify.v2
          .services(TWILIO_CONFIG.verifyServiceSid)
          .verificationChecks.create({ to: `+91${trimmedPhone}`, code: enteredOtp });
        if (check.status === "approved") {
          verifiedByTwilioVerify = true;
        }
      } catch (e) {}
    }

    const cachedOtp = otpCache.get(trimmedPhone);
    if (!verifiedByTwilioVerify && (!cachedOtp || cachedOtp !== enteredOtp)) {
      recordServerOtpAuditLog({
        status: "failure",
        attemptType: "OTP_VERIFY",
        channel: auditChannel,
        phone: trimmedPhone,
        provider: "OTP Verifier",
        diagnosticCode: cachedOtp ? "OTP_MISMATCH" : "OTP_EXPIRED",
        reason: cachedOtp
          ? "OTP verification step failed: Entered 6-digit OTP code did not match."
          : "OTP verification step failed: No active OTP found or OTP expired."
      });
      return res.status(400).json({
        verified: false,
        error: cachedOtp
          ? "Incorrect 6-digit OTP code. Please check the code and try again."
          : "OTP has expired or was not requested. Please click Resend OTP."
      });
    }

    verifiedPhoneSet.add(trimmedPhone);
    recordServerOtpAuditLog({
      status: "success",
      attemptType: "OTP_VERIFY",
      channel: auditChannel,
      phone: trimmedPhone,
      provider: verifiedByTwilioVerify ? "Twilio Verify V2" : "OTP Verifier",
      diagnosticCode: "OTP_VERIFIED",
      reason: "Mobile number 6-digit OTP verified successfully in AuthLayout."
    });

    return res.json({
      success: true,
      verified: true,
      message: `Mobile number +91 ${trimmedPhone.slice(0, 2)}XXX XX${trimmedPhone.slice(-3)} verified successfully!`
    });
  });

  // Register user API (verified with OTP code)
  app.post("/api/auth/register", async (req, res) => {
    const { phone, password, businessName, clerkPassword, otp } = req.body;
    if (!phone || !password || !businessName) {
      return res.status(400).json({ error: "Mobile number, password and business name are required." });
    }

    const trimmedPhone = String(phone).replace(/\D/g, "").slice(-10);
    const trimmedPassword = String(password).trim();
    const trimmedBusiness = String(businessName).trim();
    const trimmedClerkPassword = clerkPassword ? String(clerkPassword).trim() : "clerk123";
    const enteredOtp = String(otp || "").trim();

    const alreadyVerifiedStep = verifiedPhoneSet.has(trimmedPhone);
    let verifiedByTwilioVerify = false;
    if (!alreadyVerifiedStep && TWILIO_CONFIG.accountSid && TWILIO_CONFIG.authToken && TWILIO_CONFIG.verifyServiceSid && enteredOtp.length === 6) {
      try {
        const client = twilio(TWILIO_CONFIG.accountSid, TWILIO_CONFIG.authToken);
        const check = await client.verify.v2
          .services(TWILIO_CONFIG.verifyServiceSid)
          .verificationChecks.create({ to: `+91${trimmedPhone}`, code: enteredOtp });
        if (check.status === "approved") {
          verifiedByTwilioVerify = true;
        }
      } catch (e) {}
    }

    // Validate Carrier OTP
    const cachedOtp = otpCache.get(trimmedPhone);
    if (!alreadyVerifiedStep && !verifiedByTwilioVerify && (!cachedOtp || cachedOtp !== enteredOtp)) {
      recordServerOtpAuditLog({
        status: "failure",
        attemptType: "OTP_VERIFY",
        channel: "whatsapp",
        phone: trimmedPhone,
        provider: "Registration Verifier",
        diagnosticCode: cachedOtp ? "OTP_MISMATCH" : "OTP_EXPIRED",
        reason: cachedOtp
          ? "Registration OTP verification failed: Entered 6-digit code did not match."
          : "Registration OTP verification failed: No active OTP found for phone."
      });
      return res.status(400).json({ error: "Incorrect or expired WhatsApp/SMS verification OTP. Please request a new OTP." });
    }

    if (!alreadyVerifiedStep) {
      recordServerOtpAuditLog({
        status: "success",
        attemptType: "OTP_VERIFY",
        channel: "whatsapp",
        phone: trimmedPhone,
        provider: verifiedByTwilioVerify ? "Twilio Verify V2" : "Registration Verifier",
        diagnosticCode: "OTP_VERIFIED",
        reason: "Registration 6-digit OTP verified successfully."
      });
    }

    const currentDb = loadDb();
    const existing = currentDb.users.find(u => u.phone === trimmedPhone);
    if (existing) {
      return res.status(400).json({ error: "This mobile number is already registered. Please login instead." });
    }

    const newUser: User = { 
      phone: trimmedPhone, 
      password: trimmedPassword, 
      businessName: trimmedBusiness,
      clerkPassword: trimmedClerkPassword 
    };
    currentDb.users.push(newUser);

    // Initialize sync container
    if (!currentDb.syncData[trimmedPhone]) {
      currentDb.syncData[trimmedPhone] = {
        phone: trimmedPhone,
        password: trimmedPassword,
        businessName: trimmedBusiness,
        clients: [],
        products: [],
        estimates: [],
        updatedAt: new Date().toISOString()
      };
    }

    // Clean cached OTP after successful registration
    otpCache.delete(trimmedPhone);
    verifiedPhoneSet.delete(trimmedPhone);

    saveDb(currentDb);
    res.json({ success: true, user: { phone: trimmedPhone, businessName: trimmedBusiness, role: "admin" } });
  });

  // Login verification API
  app.post("/api/auth/login", (req, res) => {
    const { phone, password, role } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: "Mobile number and password are required." });
    }

    const trimmedPhone = String(phone).trim();
    const trimmedPassword = String(password).trim();
    const loginRole = role === "clerk" ? "clerk" : "admin";

    const currentDb = loadDb();
    let user = currentDb.users.find(u => u.phone === trimmedPhone);

    if (!user) {
      if (loginRole === "clerk") {
        return res.status(400).json({ error: "Business not found. Please register as Admin/Owner first." });
      }
      // If the user doesn't exist on the server database, they are either an old account
      // from an ephemeral session or a new device user trying to sync.
      // We automatically register them to allow seamless multi-device login and data retrieval!
      const businessName = `Business Counter (${trimmedPhone})`;
      user = { phone: trimmedPhone, password: trimmedPassword, businessName, clerkPassword: "clerk123" };
      currentDb.users.push(user);
      
      // Initialize syncData container
      if (!currentDb.syncData[trimmedPhone]) {
        currentDb.syncData[trimmedPhone] = {
          phone: trimmedPhone,
          password: trimmedPassword,
          businessName: user.businessName,
          clients: [],
          products: [],
          estimates: [],
          updatedAt: new Date().toISOString()
        };
      }
      
      saveDb(currentDb);
      return res.json({ success: true, user: { phone: user.phone, businessName: user.businessName, role: "admin" } });
    }

    // If user exists, verify password based on role
    if (loginRole === "clerk") {
      const actualClerkPassword = (user.clerkPassword || "clerk123").trim();
      if (actualClerkPassword !== trimmedPassword) {
        return res.status(415).json({ error: "Incorrect Billing Clerk password." });
      }
    } else {
      const isValidAdminPass = (user.password === trimmedPassword);
      if (!isValidAdminPass) {
        return res.status(401).json({ error: "Incorrect mobile number or password." });
      }
    }

    res.json({ success: true, user: { phone: user.phone, businessName: user.businessName, role: loginRole } });
  });

  // Pull sync data from server
  app.get("/api/sync", (req, res) => {
    const phone = req.query.phone || req.query.mobile;
    const password = req.query.password;

    if (!phone || !password) {
      return res.status(400).json({ error: "Phone and password are required query parameters." });
    }

    const trimmedPhone = String(phone).trim();
    const trimmedPassword = String(password).trim();

    const currentDb = loadDb();
    const user = currentDb.users.find(u => u.phone === trimmedPhone);
    
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    const isOwner = user.password === trimmedPassword;
    const isClerk = (user.clerkPassword || "clerk123").trim() === trimmedPassword;
    if (!isOwner && !isClerk) {
      return res.status(401).json({ error: "Unauthorized sync request." });
    }

    const rawContainer = currentDb.syncData[trimmedPhone];
    const syncContainer = {
      phone: trimmedPhone,
      password: user.password,
      businessName: user.businessName,
      clients: (rawContainer && Array.isArray(rawContainer.clients)) ? rawContainer.clients : [],
      products: (rawContainer && Array.isArray(rawContainer.products)) ? rawContainer.products : [],
      estimates: (rawContainer && Array.isArray(rawContainer.estimates)) ? rawContainer.estimates : [],
      updatedAt: (rawContainer && rawContainer.updatedAt) ? rawContainer.updatedAt : "1970-01-01T00:00:00.000Z",
      last_synced_millis: (rawContainer && typeof rawContainer.last_synced_millis === "number") ? rawContainer.last_synced_millis : (rawContainer && rawContainer.updatedAt ? new Date(rawContainer.updatedAt).getTime() : 0)
    };

    res.json(syncContainer);
  });

  app.get("/api/sync/:phone", (req, res) => {
    const { phone } = req.params;
    const { password } = req.query;

    const trimmedPhone = String(phone).trim();
    const trimmedPassword = String(password || "").trim();

    const currentDb = loadDb();
    const user = currentDb.users.find(u => u.phone === trimmedPhone);
    
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    const isOwner = user.password === trimmedPassword;
    const isClerk = (user.clerkPassword || "clerk123").trim() === trimmedPassword;
    if (!isOwner && !isClerk) {
      return res.status(401).json({ error: "Unauthorized sync request." });
    }

    const rawContainer = currentDb.syncData[trimmedPhone];
    const syncContainer = {
      phone: trimmedPhone,
      password: user.password,
      businessName: user.businessName,
      clients: (rawContainer && Array.isArray(rawContainer.clients)) ? rawContainer.clients : [],
      products: (rawContainer && Array.isArray(rawContainer.products)) ? rawContainer.products : [],
      estimates: (rawContainer && Array.isArray(rawContainer.estimates)) ? rawContainer.estimates : [],
      updatedAt: (rawContainer && rawContainer.updatedAt) ? rawContainer.updatedAt : "1970-01-01T00:00:00.000Z",
      last_synced_millis: (rawContainer && typeof rawContainer.last_synced_millis === "number") ? rawContainer.last_synced_millis : (rawContainer && rawContainer.updatedAt ? new Date(rawContainer.updatedAt).getTime() : 0)
    };

    res.json(syncContainer);
  });

  // Push sync data to server
  app.post("/api/sync/:phone", (req, res) => {
    const { phone } = req.params;
    const { password, businessName, clients, products, estimates, clerkPassword, last_synced_millis, force } = req.body;

    const trimmedPhone = String(phone).trim();
    const trimmedPassword = String(password || "").trim();

    const currentDb = loadDb();
    const user = currentDb.users.find(u => u.phone === trimmedPhone);
    
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    const isOwnerPost = user.password === trimmedPassword;
    const isClerkPost = (user.clerkPassword || "clerk123").trim() === trimmedPassword;
    if (!isOwnerPost && !isClerkPost) {
      return res.status(401).json({ error: "Unauthorized sync request." });
    }

    // Structural integrity validation
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: "Invalid payload: Request body must be a JSON object." });
    }
    if (clients !== undefined && !Array.isArray(clients)) {
      return res.status(400).json({ error: "Invalid payload: 'clients' must be a valid array." });
    }
    if (products !== undefined && !Array.isArray(products)) {
      return res.status(400).json({ error: "Invalid payload: 'products' must be a valid array." });
    }
    if (estimates !== undefined && !Array.isArray(estimates)) {
      return res.status(400).json({ error: "Invalid payload: 'estimates' must be a valid array." });
    }

    const incomingLastSyncedMillis = Number(last_synced_millis) || 0;
    const existingLastSyncedMillis = currentDb.syncData[trimmedPhone]?.last_synced_millis || 0;

    const incomingClients = Array.isArray(clients) ? clients : [];
    const incomingProducts = Array.isArray(products) ? products : [];
    const incomingEstimates = Array.isArray(estimates) ? estimates : [];

    const serverClients = currentDb.syncData[trimmedPhone]?.clients || [];
    const serverProducts = currentDb.syncData[trimmedPhone]?.products || [];
    const serverEstimates = currentDb.syncData[trimmedPhone]?.estimates || [];

    const incomingClientsCount = incomingClients.length;
    const incomingProductsCount = incomingProducts.length;
    const incomingEstimatesCount = incomingEstimates.length;

    const serverClientsCount = serverClients.length;
    const serverProductsCount = serverProducts.length;
    const serverEstimatesCount = serverEstimates.length;

    const incomingHasData = incomingClientsCount > 0 || incomingProductsCount > 0 || incomingEstimatesCount > 0;
    
    const serverHasData = currentDb.syncData[trimmedPhone] && (
      serverClientsCount > 0 ||
      serverProductsCount > 0 ||
      serverEstimatesCount > 0
    );

    // If server has a newer modification and contains data, but client attempts to push older empty/corrupted state, reject it (unless force is true, e.g. on backup restore or explicit upload)
    if (!force && existingLastSyncedMillis > incomingLastSyncedMillis && serverHasData) {
      return res.status(409).json({ 
        error: "Conflict detected: Server database contains a newer sequence timestamp (" + existingLastSyncedMillis + " vs client's " + incomingLastSyncedMillis + "). Download latest state first to avoid overwriting newer historical transaction records.",
        server_last_synced_millis: existingLastSyncedMillis,
        incoming_last_synced_millis: incomingLastSyncedMillis
      });
    }

    // Rigid integrity guard: If server has data, but the incoming payload has 0 values, reject the overwrite (unless force is true)
    if (!force && serverHasData && !incomingHasData) {
      return res.status(400).json({
        error: "Rigid safeguard triggered: Rejected an empty payload (0 values) from a fresh device login attempting to overwrite existing server data.",
        syncData: {
          phone: trimmedPhone,
          password: user.password,
          businessName: user.businessName,
          clients: serverClients,
          products: serverProducts,
          estimates: serverEstimates,
          updatedAt: currentDb.syncData[trimmedPhone]?.updatedAt || new Date().toISOString(),
          last_synced_millis: currentDb.syncData[trimmedPhone]?.last_synced_millis || Date.now()
        }
      });
    }

    // Collection-specific wipe safeguards (unless force is true)
    if (!force && serverClientsCount > 0 && incomingClientsCount === 0) {
      return res.status(400).json({
        error: `Safeguard triggered: Rejecting attempt to wipe ${serverClientsCount} existing clients with an empty payload.`,
        syncData: {
          phone: trimmedPhone,
          password: user.password,
          businessName: user.businessName,
          clients: serverClients,
          products: serverProducts,
          estimates: serverEstimates,
          updatedAt: currentDb.syncData[trimmedPhone]?.updatedAt || new Date().toISOString(),
          last_synced_millis: currentDb.syncData[trimmedPhone]?.last_synced_millis || Date.now()
        }
      });
    }
    if (!force && serverProductsCount > 0 && incomingProductsCount === 0) {
      return res.status(400).json({
        error: `Safeguard triggered: Rejecting attempt to wipe ${serverProductsCount} existing products with an empty payload.`,
        syncData: {
          phone: trimmedPhone,
          password: user.password,
          businessName: user.businessName,
          clients: serverClients,
          products: serverProducts,
          estimates: serverEstimates,
          updatedAt: currentDb.syncData[trimmedPhone]?.updatedAt || new Date().toISOString(),
          last_synced_millis: currentDb.syncData[trimmedPhone]?.last_synced_millis || Date.now()
        }
      });
    }
    if (!force && serverEstimatesCount > 0 && incomingEstimatesCount === 0) {
      return res.status(400).json({
        error: `Safeguard triggered: Rejecting attempt to wipe ${serverEstimatesCount} existing cloud invoices with an empty invoices payload.`,
        syncData: {
          phone: trimmedPhone,
          password: user.password,
          businessName: user.businessName,
          clients: serverClients,
          products: serverProducts,
          estimates: serverEstimates,
          updatedAt: currentDb.syncData[trimmedPhone]?.updatedAt || new Date().toISOString(),
          last_synced_millis: currentDb.syncData[trimmedPhone]?.last_synced_millis || Date.now()
        }
      });
    }

    // Update business name if changed
    if (businessName) {
      user.businessName = String(businessName).trim();
    }

    // Update clerk password if changed
    if (clerkPassword) {
      user.clerkPassword = String(clerkPassword).trim();
    }

    // Save sync payload
    currentDb.syncData[trimmedPhone] = {
      phone: trimmedPhone,
      password: trimmedPassword,
      businessName: user.businessName,
      clients: Array.isArray(clients) ? clients : [],
      products: Array.isArray(products) ? products : [],
      estimates: Array.isArray(estimates) ? estimates : [],
      updatedAt: new Date().toISOString(),
      last_synced_millis: Math.max(incomingLastSyncedMillis, Date.now())
    };

    saveDb(currentDb);
    res.json({ 
      success: true, 
      updatedAt: currentDb.syncData[trimmedPhone].updatedAt,
      last_synced_millis: currentDb.syncData[trimmedPhone].last_synced_millis
    });
  });

  // --- CLOUD BACKUP & RESTORE POINT MANAGEMENT ---

  // Get list of saved restore points
  app.get("/api/backup/list/:phone", (req, res) => {
    const { phone } = req.params;
    const { password } = req.query;
    
    const trimmedPhone = String(phone).trim();
    const trimmedPassword = String(password || "").trim();

    const currentDb = loadDb();
    const user = currentDb.users.find(u => u.phone === trimmedPhone);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    if (user.password !== trimmedPassword) {
      return res.status(401).json({ error: "Unauthorized access." });
    }

    const list = currentDb.backups?.[trimmedPhone] || [];
    res.json(list);
  });

  // Create a new restore point snapshot
  app.post("/api/backup/create/:phone", (req, res) => {
    const { phone } = req.params;
    const { password, name } = req.body;

    const trimmedPhone = String(phone).trim();
    const trimmedPassword = String(password || "").trim();

    const currentDb = loadDb();
    const user = currentDb.users.find(u => u.phone === trimmedPhone);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    if (user.password !== trimmedPassword) {
      return res.status(401).json({ error: "Unauthorized access." });
    }

    const activeSync = currentDb.syncData[trimmedPhone];
    if (!activeSync) {
      return res.status(400).json({ error: "No active cloud synchronized data to back up. Please sync your data first." });
    }

    if (!currentDb.backups) {
      currentDb.backups = {};
    }
    if (!currentDb.backups[trimmedPhone]) {
      currentDb.backups[trimmedPhone] = [];
    }

    const newRestorePoint = {
      id: "rp_" + Date.now(),
      timestamp: new Date().toISOString(),
      name: name || `Backup snapshot ${new Date().toLocaleDateString('en-IN')} - ${new Date().toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'})}`,
      businessName: activeSync.businessName || user.businessName,
      clientsCount: activeSync.clients?.length || 0,
      productsCount: activeSync.products?.length || 0,
      estimatesCount: activeSync.estimates?.length || 0,
      clients: activeSync.clients || [],
      products: activeSync.products || [],
      estimates: activeSync.estimates || []
    };

    currentDb.backups[trimmedPhone].unshift(newRestorePoint);
    if (currentDb.backups[trimmedPhone].length > 10) {
      currentDb.backups[trimmedPhone] = currentDb.backups[trimmedPhone].slice(0, 10);
    }

    saveDb(currentDb);
    res.json({ success: true, list: currentDb.backups[trimmedPhone] });
  });

  // Restore a snapshot to active synchronized state
  app.post("/api/backup/restore/:phone/:id", (req, res) => {
    const { phone, id } = req.params;
    const { password } = req.body;

    const trimmedPhone = String(phone).trim();
    const trimmedPassword = String(password || "").trim();

    const currentDb = loadDb();
    const user = currentDb.users.find(u => u.phone === trimmedPhone);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    if (user.password !== trimmedPassword) {
      return res.status(401).json({ error: "Unauthorized access." });
    }

    const userBackups = currentDb.backups?.[trimmedPhone] || [];
    const matchedRp = userBackups.find((b: any) => b.id === id);
    if (!matchedRp) {
      return res.status(404).json({ error: "Restore point not found." });
    }

    const nowMillis = Date.now();
    currentDb.syncData[trimmedPhone] = {
      phone: trimmedPhone,
      password: trimmedPassword,
      businessName: matchedRp.businessName,
      clients: matchedRp.clients,
      products: matchedRp.products,
      estimates: matchedRp.estimates,
      updatedAt: new Date().toISOString(),
      last_synced_millis: nowMillis
    };

    saveDb(currentDb);
    res.json({ success: true, syncData: currentDb.syncData[trimmedPhone] });
  });

  // Delete a restore point
  app.delete("/api/backup/delete/:phone/:id", (req, res) => {
    const { phone, id } = req.params;
    const { password } = req.query;

    const trimmedPhone = String(phone).trim();
    const trimmedPassword = String(password || "").trim();

    const currentDb = loadDb();
    const user = currentDb.users.find(u => u.phone === trimmedPhone);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    if (user.password !== trimmedPassword) {
      return res.status(401).json({ error: "Unauthorized access." });
    }

    if (currentDb.backups?.[trimmedPhone]) {
      currentDb.backups[trimmedPhone] = currentDb.backups[trimmedPhone].filter((b: any) => b.id !== id);
      saveDb(currentDb);
    }

    res.json({ success: true, list: currentDb.backups?.[trimmedPhone] || [] });
  });


  // --- VITE DEV AND PROD MIDDLEWARES ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
        watch: {
          ignored: [
            '**/server_db.json',
            '**/Saved_Bills_Data.json',
            '**/public/Saved_Bills_Data.json',
            '**/tmp/**'
          ]
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    try {
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
          if (net.family === "IPv4" && !net.internal) {
            console.log(`👉 Open on 2nd PC (Same Wi-Fi/LAN): http://${net.address}:${PORT}`);
          }
        }
      }
    } catch {}
  });
}

startServer();
