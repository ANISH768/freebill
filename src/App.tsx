import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from './db';
import { Client, Product, Estimate, User, StockLog, PaymentRecord } from './types';
import AuthLayout from './components/AuthLayout';
import Dashboard from './components/Dashboard';
import CreateEstimate from './components/CreateEstimate';
import Inventory from './components/Inventory';
import Customers from './components/Customers';
import Statements from './components/Statements';
import Backup from './components/Backup';
import PrintInvoice from './components/PrintInvoice';
import PrintCustomizer from './components/PrintCustomizer';
import Settings from './components/Settings';
import CounterLockScreen from './components/CounterLockScreen';
import KeyboardShortcutModal from './components/KeyboardShortcutModal';
import { ConfirmModalHost } from './components/ConfirmModalHost';
import { requestConfirm } from './utils/confirmModal';
import { 
  AppSettings, 
  CounterLockConfig, 
  getSavedAppSettings, 
  saveAppSettings, 
  applyDarkModeToDocument 
} from './utils/appSettings';
import { getSavedPrintConfig } from './utils/printConfig';
import { t, getSavedLanguage, SupportedLanguage } from './utils/i18n';
import { Shield, LayoutDashboard, FileSpreadsheet, Layers, Users, Landmark, Database, UserCheck, LogOut, CheckCircle, ChevronLeft, ChevronRight, Lock, Unlock, Printer, Settings as SettingsIcon, Moon, Sun, Globe2, Keyboard } from 'lucide-react';
import { safeStorage, saveUserIsolatedData, getUserIsolatedData, addToOfflineSyncQueue, getOfflineSyncQueue, removeFromOfflineSyncQueue, clearOfflineSyncQueue } from './utils/storage';
import { requestPersistentStorage } from './utils/crypto';
import { pushUserSyncToFirestore, fetchUserSyncFromFirestore, isFirebaseConfigured, subscribeToUserFirestoreSync } from './db/firebase';
import { isEstimateForClient } from './utils/clientMatching';

const sanitizeEstimates = (estimates: any[]): Estimate[] => {
  if (!Array.isArray(estimates)) return [];
  return estimates.map(est => {
    let subtotal = 0;
    const updatedItems = (est.items || []).map((item: any) => {
      const itemPrice = Number(item.price) || 0;
      const itemQty = Number(item.qty) || 0;
      const itemDisc = Number(item.disc) || 0;
      const itemTotal = item.total !== undefined && !isNaN(Number(item.total))
        ? Number(item.total)
        : (itemPrice * itemQty * (1 - itemDisc / 100));
      subtotal += itemTotal;
      return {
        ...item,
        disc: itemDisc,
        total: itemTotal
      };
    });
    const taxAmt = est.taxAmt !== undefined && !isNaN(Number(est.taxAmt))
      ? Number(est.taxAmt)
      : subtotal * ((Number(est.taxPct) || 0) / 100);
    const grandTotal = est.grandTotal !== undefined && !isNaN(Number(est.grandTotal))
      ? Math.round(Number(est.grandTotal))
      : Math.round(Math.max(0, (subtotal + taxAmt) - (Number(est.cashDiscount) || 0)));
    const balanceDue = est.balanceDue !== undefined && !isNaN(Number(est.balanceDue))
      ? Number(est.balanceDue)
      : Math.max(0, grandTotal - (Number(est.paidAmount) || 0));
    return {
      ...est,
      subtotal: est.subtotal !== undefined && !isNaN(Number(est.subtotal)) ? Number(est.subtotal) : subtotal,
      taxAmt,
      grandTotal,
      balanceDue,
      items: updatedItems
    };
  });
};

export const sanitizeClients = (clients: any[]): Client[] => {
  if (!Array.isArray(clients)) return [];
  const seenPhones = new Set<string>();
  const seenIds = new Set<number>();
  const uniqueList: Client[] = [];

  for (const c of clients) {
    if (!c) continue;
    const cleanName = (c.name || '').trim();
    const cleanPhone = (c.phone || '').trim();
    if (!cleanName && !cleanPhone) continue;

    let id = Number(c.id) || (Date.now() + Math.floor(Math.random() * 100000));
    while (seenIds.has(id)) {
      id += 1;
    }
    seenIds.add(id);

    uniqueList.push({
      ...c,
      id,
      name: cleanName || 'Customer',
      phone: cleanPhone || '',
      address: c.address || '',
      gstin: c.gstin || '',
      state: c.state || '',
      openingBalance: Number(c.openingBalance) || 0
    });
  }
  return uniqueList;
};

export const sanitizeProducts = (products: any[]): Product[] => {
  if (!Array.isArray(products)) return [];
  const seenNames = new Set<string>();
  const seenIds = new Set<number>();
  const uniqueList: Product[] = [];

  for (const p of products) {
    if (!p) continue;
    const cleanName = (p.name || '').trim();
    if (!cleanName) continue;
    const nameKey = cleanName.toLowerCase();
    
    // If this product name has already been encountered, deduplicate it
    if (seenNames.has(nameKey)) {
      const existing = uniqueList.find(item => item.name.toLowerCase() === nameKey);
      if (existing) {
        // preserve stock & info if existing had 0
        if (Number(p.stock) > 0 && (!existing.stock || existing.stock === 0)) {
          existing.stock = Number(p.stock);
        }
        if (!existing.mrp && p.mrp) existing.mrp = Number(p.mrp);
        if (!existing.sku && p.sku) existing.sku = p.sku;
      }
      continue;
    }
    seenNames.add(nameKey);

    let id = Number(p.id) || (Date.now() + Math.floor(Math.random() * 100000));
    while (seenIds.has(id)) {
      id += 1;
    }
    seenIds.add(id);

    uniqueList.push({
      ...p,
      id,
      name: cleanName,
      sku: p.sku || '',
      unit: p.unit || 'Pcs',
      stock: Number(p.stock) || 0,
      price: Number(p.price) || 0,
      mrp: Number(p.mrp) || 0,
      purchasePrice: Number(p.purchasePrice) || (Number(p.price) * 0.75),
      discount: Number(p.discount) || 0,
      minStock: p.minStock !== undefined ? Number(p.minStock) : 5
    });
  }
  return uniqueList;
};

const getClientsKey = (phone: string) => `user_${phone}_customers`;
const getProductsKey = (phone: string) => `user_${phone}_products`;
const getEstimatesKey = (phone: string) => `user_${phone}_invoices`;
const getStockLogsKey = (phone: string) => `user_${phone}_stock_logs`;
const getMutationKey = (phone: string) => `user_${phone}_last_local_mutation`;
const getSyncedOnceKey = (phone: string) => `user_${phone}_has_synced_once`;
const getNewlyRegisteredKey = (phone: string) => `user_${phone}_newly_registered`;
const getDeletedEstimatesKey = (phone: string) => `user_${phone}_deleted_estimate_ids`;

const getDeletedEstimateIds = (phone?: string | null): Set<number> => {
  if (!phone) return new Set();
  try {
    const raw = safeStorage.getItem(getDeletedEstimatesKey(phone));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map(Number).filter(n => !isNaN(n)));
      }
    }
  } catch (e) {}
  return new Set();
};

const addDeletedEstimateId = (phone: string | null | undefined, id: number) => {
  if (!phone) return;
  try {
    const set = getDeletedEstimateIds(phone);
    set.add(Number(id));
    safeStorage.setItem(getDeletedEstimatesKey(phone), JSON.stringify(Array.from(set)));
  } catch (e) {}
};

const filterDeletedEstimates = (estimates: Estimate[], phone?: string | null): Estimate[] => {
  if (!Array.isArray(estimates)) return [];
  const deletedSet = getDeletedEstimateIds(phone);
  if (deletedSet.size === 0) return estimates;
  return estimates.filter(e => e && !deletedSet.has(Number(e.id)));
};

const isMockDataset = (clients: any[], estimates: any[]) => {
  return false;
};

const migrateOldKeysIfAny = (userId: string): boolean => {
  let restored = false;
  try {
    const clientsKey = `user_${userId}_customers`;
    const productsKey = `user_${userId}_products`;
    const estimatesKey = `user_${userId}_invoices`;
    const stockLogsKey = `user_${userId}_stock_logs`;

    // 1. Recover clients/customers ONLY if active key is completely missing from storage
    const activeClientsStr = safeStorage.getItem(clientsKey);
    if (activeClientsStr === null) {
      let bestClients: any[] = [];
      const candidateClientKeys = [
        `user_${userId}_clients`,
        `off_clients_${userId}`
      ];
      candidateClientKeys.forEach(k => {
        try {
          const raw = safeStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > bestClients.length) {
              bestClients = parsed;
            }
          }
        } catch (e) {}
      });

      if (bestClients.length > 0) {
        safeStorage.setItem(clientsKey, JSON.stringify(bestClients));
        restored = true;
        console.log(`[Self-Healing] Customers initialized from backup: ${bestClients.length} items.`);
      }
    }

    // 2. Recover products ONLY if active key is completely missing from storage
    const activeProductsStr = safeStorage.getItem(productsKey);
    if (activeProductsStr === null) {
      let bestProducts: any[] = [];
      const candidateProductKeys = [
        `user_${userId}_products`,
        `off_products_${userId}`
      ];
      candidateProductKeys.forEach(k => {
        try {
          const raw = safeStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > bestProducts.length) {
              bestProducts = parsed;
            }
          }
        } catch (e) {}
      });

      if (bestProducts.length > 0) {
        safeStorage.setItem(productsKey, JSON.stringify(bestProducts));
        restored = true;
        console.log(`[Self-Healing] Products initialized from backup: ${bestProducts.length} items.`);
      }
    }

    // 3. Recover estimates/invoices ONLY if active key is completely missing from storage
    const activeEstimatesStr = safeStorage.getItem(estimatesKey);
    if (activeEstimatesStr === null) {
      let bestEstimates: any[] = [];
      const candidateEstimateKeys = [
        `user_${userId}_estimates`,
        `off_estimates_${userId}`
      ];
      candidateEstimateKeys.forEach(k => {
        try {
          const raw = safeStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > bestEstimates.length) {
              bestEstimates = parsed;
            }
          }
        } catch (e) {}
      });

      if (bestEstimates.length > 0) {
        safeStorage.setItem(estimatesKey, JSON.stringify(bestEstimates));
        restored = true;
        console.log(`[Self-Healing] Invoices initialized from backup: ${bestEstimates.length} items.`);
      }
    }

    // 4. Recover stock logs ONLY if active key is completely missing from storage
    const activeStockLogsStr = safeStorage.getItem(stockLogsKey);
    if (activeStockLogsStr === null) {
      let bestStockLogs: any[] = [];
      const candidateLogKeys = [
        `user_${userId}_stock_logs`,
        `off_stock_logs_${userId}`
      ];
      candidateLogKeys.forEach(k => {
        try {
          const raw = safeStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > bestStockLogs.length) {
              bestStockLogs = parsed;
            }
          }
        } catch (e) {}
      });

      if (bestStockLogs.length > 0) {
        safeStorage.setItem(stockLogsKey, JSON.stringify(bestStockLogs));
        restored = true;
      }
    }
  } catch (err) {
    console.error("[Migration] Recovery error:", err);
  }
  return restored;
};

export default function App() {
  // Session details loading states
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'clerk'>('admin');
  const isPendingPushRef = useRef(false);
  const lastLocalMutationTimeRef = useRef<number>(0);
  const [lastLocalMutationTime, setLastLocalMutationTime] = useState<number>(0);
  const [businessName, setBusinessName] = useState('My Offline Counter');
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const [isSyncingLogin, setIsSyncingLogin] = useState(false);
  const [syncMessage, setSyncMessage] = useState('Downloading your latest multi-device cloud backup. Please do not close or reload this window.');
  const [renderKey, setRenderKey] = useState(0);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'synced' | 'saving' | 'offline' | 'error' | null>('synced');

  const registerLocalMutation = () => {
    const now = Date.now();
    lastLocalMutationTimeRef.current = now;
    setLastLocalMutationTime(now);
    if (currentUser) {
      try {
        safeStorage.setItem(`last_local_mutation_${currentUser}`, now.toString());
        safeStorage.setItem(getMutationKey(currentUser), now.toString());
        safeStorage.setItem(`user_${currentUser}_last_synced_millis`, now.toString());
      } catch (e) {}
    }
  };

  // DB collection local registers
  const [dbUsers, setDbUsers] = useState<User[]>([]);
  const [dbClients, setDbClients] = useState<Client[]>([]);
  const [dbProducts, setDbProducts] = useState<Product[]>([]);
  const [dbEstimates, setDbEstimates] = useState<Estimate[]>([]);
  const [dbStockLogs, setDbStockLogs] = useState<StockLog[]>([]);
  const [costFallbackPct, setCostFallbackPct] = useState<number>(() => {
    try {
      const stored = safeStorage.getItem('off_cost_fallback_pct');
      return stored ? parseInt(stored) : 80;
    } catch {
      return 80;
    }
  });

  const handleUpdateCostFallbackPct = (pct: number) => {
    setCostFallbackPct(pct);
    try {
      safeStorage.setItem('off_cost_fallback_pct', pct.toString());
    } catch (e) {}
    showToast(`Default Cost Price fallback updated to ${pct}% of sales price!`);
  };

  // App Settings, Dark Mode, & Retail Counter Lock Engine
  const [appSettings, setAppSettings] = useState<AppSettings>(() => getSavedAppSettings(currentUser || undefined));
  const [isCounterLocked, setIsCounterLocked] = useState<boolean>(false);
  const lastUserActivityRef = useRef<number>(Date.now());
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(() => getSavedLanguage());

  // User activity tracker for Counter Inactivity Auto-Lock
  useEffect(() => {
    const handleUserActivity = () => {
      lastUserActivityRef.current = Date.now();
    };

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);
    window.addEventListener('scroll', handleUserActivity);
    window.addEventListener('click', handleUserActivity);

    const checkLockInterval = setInterval(() => {
      if (
        appSettings.counterLock.enabled &&
        appSettings.counterLock.autoLockMinutes > 0 &&
        !isCounterLocked &&
        currentUser
      ) {
        const elapsedMins = (Date.now() - lastUserActivityRef.current) / (60 * 1000);
        if (elapsedMins >= appSettings.counterLock.autoLockMinutes) {
          setIsCounterLocked(true);
        }
      }
    }, 10000);

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('scroll', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      clearInterval(checkLockInterval);
    };
  }, [appSettings.counterLock, isCounterLocked, currentUser]);

  // Sync settings and apply dark mode
  useEffect(() => {
    applyDarkModeToDocument(appSettings.darkMode);
    const handleSettingsUpdated = (e: any) => {
      if (e.detail) {
        setAppSettings(e.detail);
        setCurrentLanguage(e.detail.language || getSavedLanguage());
      }
    };
    window.addEventListener('app_settings_updated', handleSettingsUpdated);
    return () => window.removeEventListener('app_settings_updated', handleSettingsUpdated);
  }, [appSettings.darkMode]);

  const handleUpdateBusinessProfile = (newDetails: {
    businessName: string;
    phone?: string;
    email?: string;
    gstin?: string;
    pan?: string;
    address?: string;
    tagline?: string;
    state?: string;
    logoUrl?: string;
    upiId?: string;
    bankName?: string;
    accountNo?: string;
    ifscCode?: string;
    branchName?: string;
  }) => {
    if (newDetails.businessName) {
      setBusinessName(newDetails.businessName);
    }
    const updatedUsers = dbUsers.map(u => {
      if (u.phone === currentUser) {
        return {
          ...u,
          businessName: newDetails.businessName || u.businessName,
          gstin: newDetails.gstin || u.gstin,
          upiId: newDetails.upiId || u.upiId
        };
      }
      return u;
    });
    handleUpdateUsers(updatedUsers);
    registerLocalMutation();
  };

  // Navigation tab route & history stack for step-by-step back navigation
  type TabType = 'dashboard' | 'create_estimate' | 'products' | 'clients' | 'statements' | 'backup' | 'print_customizer' | 'scan_camera' | 'settings';
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [tabHistory, setTabHistory] = useState<TabType[]>(['dashboard']);

  // Centralized Navigation helper that records tab history
  const navigateToTab = (newTab: TabType, options?: { replace?: boolean }) => {
    if (newTab === currentTab) return;
    setCurrentTab(newTab);
    if (!options?.replace) {
      setTabHistory(prev => {
        if (prev[prev.length - 1] === newTab) return prev;
        return [...prev, newTab];
      });
      try {
        window.history.pushState({ tab: newTab, time: Date.now() }, '', window.location.pathname);
      } catch (e) {}
    }
  };

  const [editingEstimateId, setEditingEstimateId] = useState<number | null>(null);
  const [activePrintEstimate, setActivePrintEstimate] = useState<Estimate | null>(null);
  const [autoTriggerPrintOnOpen, setAutoTriggerPrintOnOpen] = useState<boolean>(false);

  // Back Navigator: Step back in history
  const goBack = () => {
    if (activePrintEstimate) {
      setActivePrintEstimate(null);
      setAutoTriggerPrintOnOpen(false);
      return;
    }
    if (editingEstimateId !== null) {
      setEditingEstimateId(null);
    }
    if (tabHistory.length > 1) {
      const updated = [...tabHistory];
      updated.pop(); // remove current tab
      const prevTab = updated[updated.length - 1];
      setTabHistory(updated);
      setCurrentTab(prevTab);
    } else {
      setCurrentTab(currentUserRole === 'clerk' ? 'create_estimate' : 'dashboard');
    }
  };

  const openPrintInvoice = (est: Estimate, autoTriggerPrint: boolean = false) => {
    setAutoTriggerPrintOnOpen(autoTriggerPrint);
    setActivePrintEstimate(est);
    try {
      window.history.pushState({ print: true, id: est.id, time: Date.now() }, '', window.location.pathname);
    } catch (e) {}
  };

  // Popstate event handler for browser / mobile back button
  useEffect(() => {
    const handlePopState = () => {
      if (activePrintEstimate) {
        setActivePrintEstimate(null);
        return;
      }
      if (editingEstimateId !== null) {
        setEditingEstimateId(null);
      }
      setTabHistory(prev => {
        if (prev.length > 1) {
          const nextStack = [...prev];
          nextStack.pop();
          const target = nextStack[nextStack.length - 1];
          setCurrentTab(target);
          return nextStack;
        }
        return prev;
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activePrintEstimate, editingEstimateId]);

  const [isMobileMode, setIsMobileMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const pref = localStorage.getItem('layout_preference');
      if (pref === 'mobile') return true;
      if (pref === 'pc') return false;
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent);
      return isMobileUA || window.innerWidth < 1024;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        const pref = localStorage.getItem('layout_preference');
        if (!pref) {
          const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent);
          setIsMobileMode(isMobileUA || window.innerWidth < 1024);
        }
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const [showShortcutGuideModal, setShowShortcutGuideModal] = useState<boolean>(false);

  const handleTriggerShortcutAction = (actionId: string) => {
    if (actionId === 'new_bill') {
      setEditingEstimateId(null);
      navigateToTab('create_estimate');
      showToast("Shortcut: Billing Screen (F2)");
    } else if (actionId === 'quick_print') {
      if (dbEstimates.length > 0) {
        const latestEst = dbEstimates[dbEstimates.length - 1];
        openPrintInvoice(latestEst, true);
        showToast(`Printing Bill ${latestEst.serial} (F3)`);
      } else {
        setEditingEstimateId(null);
        navigateToTab('create_estimate');
        showToast("Shortcut: Billing Screen opened (F3)");
      }
    } else if (actionId === 'inventory') {
      navigateToTab('products');
      showToast("Shortcut: Inventory Screen opened! (F4)");
      setTimeout(() => {
        const input = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (input) input.focus();
      }, 120);
    } else if (actionId === 'focus_party') {
      setEditingEstimateId(null);
      navigateToTab('create_estimate');
      showToast("Shortcut: Select Billing Party (F6)");
      setTimeout(() => {
        const partyInput = document.getElementById('pos-party-search-input') as HTMLInputElement;
        if (partyInput) {
          partyInput.focus();
          partyInput.select();
        }
      }, 100);
    } else if (actionId === 'clients') {
      setEditingEstimateId(null);
      navigateToTab('clients');
      showToast("Shortcut: Parties & Customers (F7)");
    } else if (actionId === 'statements') {
      setEditingEstimateId(null);
      navigateToTab('statements');
      showToast("Shortcut: Party Ledgers & Passbook (F8)");
    } else if (actionId === 'dashboard' && currentUserRole !== 'clerk') {
      setEditingEstimateId(null);
      navigateToTab('dashboard');
      showToast("Shortcut: Dashboard & Reports (F9)");
    }
  };

  useEffect(() => {
    const handleOpenShortcutsEvent = () => setShowShortcutGuideModal(true);
    window.addEventListener('open_keyboard_shortcuts', handleOpenShortcutsEvent);
    return () => window.removeEventListener('open_keyboard_shortcuts', handleOpenShortcutsEvent);
  }, []);

  // Global Keyboard Shortcuts (F1: Keyboard Shortcut Guide, F2: New Bill / Add Item Row, F3: Print, F4: Products, F6: Focus Party, F7: Parties, F8: Ledgers, F9: Dashboard, Esc: Back)
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        e.stopPropagation();
        setShowShortcutGuideModal(prev => !prev);
      } else if (e.key === 'F2') {
        if (currentTab !== 'create_estimate') {
          e.preventDefault();
          e.stopPropagation();
          setEditingEstimateId(null);
          navigateToTab('create_estimate');
          showToast("Shortcut: Billing Screen (F2)");
        }
      } else if (e.key === 'F3') {
        if (currentTab !== 'create_estimate' && !activePrintEstimate) {
          e.preventDefault();
          e.stopPropagation();
          if (dbEstimates.length > 0) {
            const latestEst = dbEstimates[dbEstimates.length - 1];
            openPrintInvoice(latestEst, true);
            showToast(`Printing Bill ${latestEst.serial} (F3)`);
          } else {
            setEditingEstimateId(null);
            navigateToTab('create_estimate');
            showToast("Shortcut: Billing Screen opened (F3)");
          }
        }
      } else if (e.key === 'F4') {
        e.preventDefault();
        navigateToTab('products');
        showToast("Shortcut: Inventory Screen opened! (F4)");
        setTimeout(() => {
          const input = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
          if (input) input.focus();
        }, 120);
      } else if (e.key === 'F6') {
        if (currentTab !== 'create_estimate') {
          e.preventDefault();
          setEditingEstimateId(null);
          navigateToTab('create_estimate');
          showToast("Shortcut: Select Billing Party (F6)");
          setTimeout(() => {
            const partyInput = document.getElementById('pos-party-search-input') as HTMLInputElement;
            if (partyInput) {
              partyInput.focus();
              partyInput.select();
            }
          }, 100);
        }
      } else if (e.key === 'F7') {
        e.preventDefault();
        setEditingEstimateId(null);
        navigateToTab('clients');
        showToast("Shortcut: Parties & Customers (F7)");
      } else if (e.key === 'F8') {
        e.preventDefault();
        setEditingEstimateId(null);
        navigateToTab('statements');
        showToast("Shortcut: Party Ledgers & Passbook (F8)");
      } else if (e.key === 'F9') {
        if (currentUserRole !== 'clerk') {
          e.preventDefault();
          setEditingEstimateId(null);
          navigateToTab('dashboard');
          showToast("Shortcut: Dashboard & Reports (F9)");
        }
      } else if (e.key === 'Escape') {
        if (showShortcutGuideModal) {
          e.preventDefault();
          setShowShortcutGuideModal(false);
        } else if (activePrintEstimate) {
          setActivePrintEstimate(null);
          setAutoTriggerPrintOnOpen(false);
          showToast("Print Preview Closed");
        } else if (currentTab !== 'dashboard') {
          e.preventDefault();
          goBack();
          showToast("Returned to previous screen");
        }
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts, true);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts, true);
  }, [isMobileMode, currentTab, activePrintEstimate, tabHistory, dbEstimates, showShortcutGuideModal, currentUserRole]);

  // Mobile POS specific state engines
  const [mobileScanStatus, setMobileScanStatus] = useState<'idle' | 'scanning' | 'success' | 'failed'>('idle');
  const [mobileScanResultItems, setMobileScanResultItems] = useState<Product[]>([]);
  const [selectedLedgerClient, setSelectedLedgerClient] = useState<Client | null>(null);
  const [selectedStatementClientId, setSelectedStatementClientId] = useState<number | ''>('');
  const [showMobileAddProduct, setShowMobileAddProduct] = useState(false);

  // Profile modal settings triggers
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileBusinessName, setProfileBusinessName] = useState('');
  const [profileNewPassword, setProfileNewPassword] = useState('');
  const [profileClerkPassword, setProfileClerkPassword] = useState('');
  const [profileCustomGeminiApiKey, setProfileCustomGeminiApiKey] = useState(() => {
    try {
      return localStorage.getItem("custom_gemini_api_key") || "";
    } catch {
      return "";
    }
  });

  // Toast notifications alerts
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isInitialPullDone, setIsInitialPullDone] = useState(false);
  const [syncConflictDetected, setSyncConflictDetected] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');
  const [isForceOfflineActive, setIsForceOfflineActive] = useState<boolean>(() => {
    try {
      return safeStorage.getItem('force_offline_mode_active') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleForceOffline = (val: boolean) => {
    setIsForceOfflineActive(val);
    try {
      safeStorage.setItem('force_offline_mode_active', val ? 'true' : 'false');
    } catch (e) {}
    showToast(val ? "📴 Fully Offline Mode Enabled! Cloud sync paused." : "📶 Cloud Sync Enabled! Sync operations active.");
  };

  // Request persistent storage on app startup
  useEffect(() => {
    requestPersistentStorage();
  }, []);

  const handleToggleDarkMode = (enabled: boolean) => {
    const updated = { ...appSettings, darkMode: enabled };
    setAppSettings(updated);
    saveAppSettings(updated, currentUser || undefined);
    applyDarkModeToDocument(enabled);
    showToast(enabled ? "🌙 Dark Mode Enabled" : "☀️ Light Mode Enabled");
  };

  const handleUpdateLockConfig = (newConfig: CounterLockConfig) => {
    const updated = { ...appSettings, counterLock: newConfig };
    setAppSettings(updated);
    saveAppSettings(updated, currentUser || undefined);
  };

  // Disable mouse wheel scrolling on number input fields globally (so users don't accidentally increment/decrement values when scrolling)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (document.activeElement && (document.activeElement as HTMLInputElement).type === 'number') {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Initial State mount & clean wipe for fresh client website
  useEffect(() => {
    // One-time fresh wipe so any existing browser cache of old test accounts is completely cleared
    const isWiped = safeStorage.getItem('fresh_client_v3_clean');
    if (!isWiped) {
      try {
        safeStorage.clear();
        safeStorage.setItem('fresh_client_v3_clean', 'true');
        db.clients.clear().catch(() => {});
        db.products.clear().catch(() => {});
        db.estimates.clear().catch(() => {});
        db.stockLogs.clear().catch(() => {});
        db.users.clear().catch(() => {});
      } catch (e) {}
    }

    // Users loading
    let usersList: User[] = [];
    try {
      const stored = safeStorage.getItem('off_users');
      const parsed = stored ? JSON.parse(stored) : null;
      usersList = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      usersList = [];
    }
    setDbUsers(usersList);

    // Current logged in session
    let storedUser = null;
    let storedRole: 'admin' | 'clerk' = 'admin';
    try {
      storedUser = safeStorage.getItem('off_current_user');
      const r = safeStorage.getItem('off_current_user_role');
      if (r === 'clerk') {
        storedRole = 'clerk';
      }
    } catch (e) {}
    if (storedUser) {
      setCurrentUser(storedUser);
      setCurrentUserRole(storedRole);
      const matched = usersList.find(u => u.phone === storedUser);
      if (matched) {
        setBusinessName(matched.businessName);
      }
      if (storedRole === 'clerk') {
        setCurrentTab('create_estimate');
      }
    }
  }, []);

  // 1a. Dynamic session loading based on active currentUser
  useEffect(() => {
    if (!currentUser) {
      setDbClients([]);
      setDbProducts([]);
      setDbEstimates([]);
      setDbStockLogs([]);
      setIsInitialPullDone(false);
      return;
    }

    // Completely wipe previous user memory states on login / session change
    setDbClients([]);
    setDbProducts([]);
    setDbEstimates([]);
    setDbStockLogs([]);

    const clientsKey = getClientsKey(currentUser);
    const productsKey = getProductsKey(currentUser);
    const estimatesKey = getEstimatesKey(currentUser);
    const stockLogsKey = getStockLogsKey(currentUser);
    const mutationKey = getMutationKey(currentUser);

    try {
      const storedTime = safeStorage.getItem(mutationKey);
      const val = storedTime ? parseInt(storedTime) : 0;
      lastLocalMutationTimeRef.current = val;
      setLastLocalMutationTime(val);
    } catch (e) {}

    // Load Clients
    try {
      const stored = safeStorage.getItem(clientsKey);
      if (stored) {
        setDbClients(JSON.parse(stored));
      } else {
        setDbClients([]);
        safeStorage.setItem(clientsKey, JSON.stringify([]));
      }
    } catch (e) {
      setDbClients([]);
    }

    // Load Products
    try {
      const stored = safeStorage.getItem(productsKey);
      if (stored) {
        const parsed = sanitizeProducts(JSON.parse(stored));
        setDbProducts(parsed);
        safeStorage.setItem(productsKey, JSON.stringify(parsed));
      } else {
        setDbProducts([]);
        safeStorage.setItem(productsKey, JSON.stringify([]));
      }
    } catch (e) {
      setDbProducts([]);
    }

    // Load Estimates
    try {
      const stored = safeStorage.getItem(estimatesKey);
      if (stored) {
        const cleaned = filterDeletedEstimates(sanitizeEstimates(JSON.parse(stored)), currentUser);
        setDbEstimates(cleaned);
        safeStorage.setItem(estimatesKey, JSON.stringify(cleaned));
      } else {
        setDbEstimates([]);
        safeStorage.setItem(estimatesKey, JSON.stringify([]));
      }
    } catch (e) {
      setDbEstimates([]);
    }

    // Load Stock Logs
    try {
      const stored = safeStorage.getItem(stockLogsKey);
      if (stored) {
        setDbStockLogs(JSON.parse(stored));
      } else {
        setDbStockLogs([]);
        safeStorage.setItem(stockLogsKey, JSON.stringify([]));
      }
    } catch (e) {
      setDbStockLogs([]);
    }
  }, [currentUser]);

  // Automatic multi-device data pull sync on startup or when user state loads
  useEffect(() => {
    if (isForceOfflineActive) {
      setIsInitialPullDone(true);
      return;
    }
    if (!currentUser) return;
    if (dbUsers.length === 0) return;
    const userMatched = dbUsers.find(u => u.phone === currentUser);
    if (!userMatched || !userMatched.password) {
      setIsInitialPullDone(true);
      return;
    }

    const startupSync = async () => {
      setSyncMessage('Downloading your latest multi-device cloud backup. Please do not close or reload this window.');
      setIsSyncingLogin(true);
      try {
        const response = await fetch(`/api/sync/${currentUser}?password=${encodeURIComponent(userMatched.password)}`);
        if (response.ok) {
          const syncData = await response.json();
          
          const clientsKey = getClientsKey(currentUser);
          const productsKey = getProductsKey(currentUser);
          const estimatesKey = getEstimatesKey(currentUser);
          const mutationKey = getMutationKey(currentUser);
          const syncedOnceKey = getSyncedOnceKey(currentUser);

          const oldClientsKey = `off_clients_${currentUser}`;
          const oldProductsKey = `off_products_${currentUser}`;
          const oldEstimatesKey = `off_estimates_${currentUser}`;

          console.log("[Auto-Sync] Fetching and validating server payload against local state...");
          
          let localClients: Client[] = [];
          let localProducts: Product[] = [];
          let localEstimates: Estimate[] = [];
          
          try {
            const rawC = safeStorage.getItem(clientsKey) || safeStorage.getItem(oldClientsKey);
            if (rawC) localClients = JSON.parse(rawC);
            const rawP = safeStorage.getItem(productsKey) || safeStorage.getItem(oldProductsKey);
            if (rawP) localProducts = JSON.parse(rawP);
            const rawE = safeStorage.getItem(estimatesKey) || safeStorage.getItem(oldEstimatesKey) || safeStorage.getItem(`user_${currentUser}_estimates`);
            if (rawE) localEstimates = filterDeletedEstimates(sanitizeEstimates(JSON.parse(rawE)), currentUser);
          } catch (e) {}

          const serverClients = Array.isArray(syncData.clients) ? syncData.clients : [];
          const serverProducts = Array.isArray(syncData.products) ? syncData.products : [];
          const serverEstimates = Array.isArray(syncData.estimates)
            ? filterDeletedEstimates(sanitizeEstimates(syncData.estimates), currentUser)
            : [];

          const serverEpoch = syncData.last_synced_millis || (syncData.updatedAt ? new Date(syncData.updatedAt).getTime() : 0);
          const localEpoch = parseInt(safeStorage.getItem(`last_local_mutation_${currentUser}`) || safeStorage.getItem(mutationKey) || "0");

          // Skip scan fallback or alternate reads if user is newly registered
          const isNewlyReg = safeStorage.getItem(`newly_registered_${currentUser}`) === 'true' || safeStorage.getItem(`user_${currentUser}_newly_registered`) === 'true';
          const hasDeletedAny = getDeletedEstimateIds(currentUser).size > 0;

          // Prevent overwrite if local state is newer or contains more data than the cloud snapshot
          const isLocalNewerOrLarger = !isNewlyReg && ((localEpoch > serverEpoch) || (localEstimates.length > serverEstimates.length));

          if (isLocalNewerOrLarger && (localEstimates.length > 0 || hasDeletedAny)) {
            console.log("[Auto-Sync] Local state is newer/larger. Preventing overwrite by older cloud snapshot.");
            
            // Merge states: incorporate any server-side estimates that might be missing locally (excluding deleted ones)
            const mergedEstimates = [...localEstimates];
            if (localEpoch < serverEpoch) {
              serverEstimates.forEach(srvEst => {
                if (!mergedEstimates.some(e => e.id === srvEst.id)) {
                  mergedEstimates.push(srvEst);
                }
              });
            }

            const mergedClients = localClients;

            const mergedProducts = localProducts.length >= serverProducts.length ? localProducts : serverProducts;

            // Save merged state back to local storage
            setDbClients(mergedClients);
            safeStorage.setItem(clientsKey, JSON.stringify(mergedClients));
            safeStorage.setItem(oldClientsKey, JSON.stringify(mergedClients));

            setDbProducts(mergedProducts);
            safeStorage.setItem(productsKey, JSON.stringify(mergedProducts));
            safeStorage.setItem(oldProductsKey, JSON.stringify(mergedProducts));

            setDbEstimates(mergedEstimates);
            safeStorage.setItem(estimatesKey, JSON.stringify(mergedEstimates));
            safeStorage.setItem(oldEstimatesKey, JSON.stringify(mergedEstimates));
            safeStorage.setItem(`user_${currentUser}_estimates`, JSON.stringify(mergedEstimates));

            const syncTime = Math.max(localEpoch, serverEpoch) + 1000;
            try {
              safeStorage.setItem(mutationKey, syncTime.toString());
              safeStorage.setItem(`user_${currentUser}_last_synced_millis`, syncTime.toString());
              lastLocalMutationTimeRef.current = syncTime;
              setLastLocalMutationTime(syncTime);
              safeStorage.setItem(`last_local_mutation_${currentUser}`, syncTime.toString());
              safeStorage.setItem(syncedOnceKey, 'true');
            } catch (e) {}

            const catchupPayload = {
              password: userMatched.password,
              businessName: businessName || syncData.businessName || "BillSync Pro",
              clients: mergedClients,
              products: mergedProducts,
              estimates: mergedEstimates,
              last_synced_millis: syncTime
            };

            // Catch-up upload to sync server to overwrite with final verified merged layout
            fetch(`/api/sync/${currentUser}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(catchupPayload)
            }).then(r => {
              if (r.ok) {
                console.log("[Auto-Sync] Cloud successfully updated to catch up with latest local state.");
              }
            }).catch(e => console.error("[Auto-Sync] Catch-up sync failed:", e));

          } else {
            // Server has the definitive newer/larger state, overwrite local
            console.log("[Auto-Sync] Server has newer/larger state. Overwriting local state with fresh cloud data.");
            setDbClients(serverClients);
            safeStorage.setItem(clientsKey, JSON.stringify(serverClients));
            safeStorage.setItem(oldClientsKey, JSON.stringify(serverClients));

            setDbProducts(serverProducts);
            safeStorage.setItem(productsKey, JSON.stringify(serverProducts));
            safeStorage.setItem(oldProductsKey, JSON.stringify(serverProducts));

            setDbEstimates(serverEstimates);
            safeStorage.setItem(estimatesKey, JSON.stringify(serverEstimates));
            safeStorage.setItem(oldEstimatesKey, JSON.stringify(serverEstimates));
            safeStorage.setItem(`user_${currentUser}_estimates`, JSON.stringify(serverEstimates));

            if (syncData.businessName) {
              setBusinessName(syncData.businessName);
            }
            if (syncData.updatedAt) {
              setLastSyncedAt(syncData.updatedAt);
            }
            
            const finalServerEpoch = Math.max(serverEpoch, localEpoch);
            try {
              safeStorage.setItem(mutationKey, finalServerEpoch.toString());
              safeStorage.setItem(`user_${currentUser}_last_synced_millis`, finalServerEpoch.toString());
              lastLocalMutationTimeRef.current = finalServerEpoch;
              setLastLocalMutationTime(finalServerEpoch);
              safeStorage.setItem(syncedOnceKey, 'true');
            } catch (e) {}
          }

          // Trigger immediate hard re-render on active UI layout
          setRenderKey(prev => prev + 1);
        } else {
          console.warn("[Auto-Sync] Server returned error, falling back to local storage.");
          const clientsKey = getClientsKey(currentUser);
          const productsKey = getProductsKey(currentUser);
          const estimatesKey = getEstimatesKey(currentUser);
          try {
            const localC = safeStorage.getItem(clientsKey);
            if (localC) setDbClients(JSON.parse(localC));
            const localP = safeStorage.getItem(productsKey);
            if (localP) setDbProducts(JSON.parse(localP));
            const localE = safeStorage.getItem(estimatesKey);
            if (localE) setDbEstimates(sanitizeEstimates(JSON.parse(localE)));
          } catch (e) {}
        }
      } catch (err) {
        console.warn("[Auto-Sync] Startup sync failed (network offline or server down), using local storage fallback:", err);
        const clientsKey = getClientsKey(currentUser);
        const productsKey = getProductsKey(currentUser);
        const estimatesKey = getEstimatesKey(currentUser);
        try {
          const localC = safeStorage.getItem(clientsKey);
          if (localC) setDbClients(JSON.parse(localC));
          const localP = safeStorage.getItem(productsKey);
          if (localP) setDbProducts(JSON.parse(localP));
          const localE = safeStorage.getItem(estimatesKey);
          if (localE) setDbEstimates(sanitizeEstimates(JSON.parse(localE)));
        } catch (e) {}
      } finally {
        setIsInitialPullDone(true);
        setIsSyncingLogin(false);
      }
    };

    startupSync();
  }, [currentUser, dbUsers]);

  // Synchronous force cloud save helper
  const forceCloudSaveSynchronous = async (
    updatedClients: Client[],
    updatedProducts: Product[],
    updatedEstimates: Estimate[],
    updatedStockLogs?: StockLog[],
    forceUpload: boolean = false
  ) => {
    if (isForceOfflineActive) {
      console.log("[Force Cloud Save] Offline mode is active. Skipping server upload.");
      return false;
    }
    if (!currentUser) return false;
    const userMatched = dbUsers.find(u => u.phone === currentUser);
    if (!userMatched || !userMatched.password) return false;

    const now = Date.now();
    lastLocalMutationTimeRef.current = now;
    setLastLocalMutationTime(now);
    try {
      safeStorage.setItem(`last_local_mutation_${currentUser}`, now.toString());
      safeStorage.setItem(getMutationKey(currentUser), now.toString());
      safeStorage.setItem(`user_${currentUser}_last_synced_millis`, now.toString());
    } catch (e) {}

    const payload = {
      password: userMatched.password,
      businessName: businessName,
      clients: updatedClients,
      products: updatedProducts,
      estimates: updatedEstimates,
      last_synced_millis: now,
      force: forceUpload
    };

    if (isFirebaseConfigured() && currentUser) {
      pushUserSyncToFirestore(currentUser, {
        businessName,
        clients: updatedClients,
        products: updatedProducts,
        estimates: updatedEstimates,
        stockLogs: updatedStockLogs || dbStockLogs,
        costFallbackPct,
        last_synced_millis: now
      }).catch(err => console.warn('[Firestore] forceCloudSave push warning:', err));
    }

    try {
      const response = await fetch(`/api/sync/${currentUser}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.status === 409 && !forceUpload) {
        console.warn("[Force Cloud Save] Conflict detected on server. Downloading latest cloud data...");
        showToast("⚠️ Sync conflict! Server contains a newer backup.");
        setSyncConflictDetected(true);
        // Automatic download sync on conflict to ensure we merge safely
        const getResponse = await fetch(`/api/sync?phone=${encodeURIComponent(currentUser)}&password=${encodeURIComponent(userMatched.password)}`);
        if (getResponse.ok) {
          const syncData = await getResponse.json();
          const clients = Array.isArray(syncData.clients) ? syncData.clients : [];
          const products = Array.isArray(syncData.products) ? syncData.products : [];
          const estimates = Array.isArray(syncData.estimates) ? sanitizeEstimates(syncData.estimates) : [];

          setDbClients(clients);
          safeStorage.setItem(getClientsKey(currentUser), JSON.stringify(clients));

          setDbProducts(products);
          safeStorage.setItem(getProductsKey(currentUser), JSON.stringify(products));

          setDbEstimates(estimates);
          safeStorage.setItem(getEstimatesKey(currentUser), JSON.stringify(estimates));

          if (syncData.businessName) setBusinessName(syncData.businessName);
          if (syncData.updatedAt) setLastSyncedAt(syncData.updatedAt);

          const serverEpoch = syncData.last_synced_millis || (syncData.updatedAt ? new Date(syncData.updatedAt).getTime() : Date.now());
          safeStorage.setItem(getMutationKey(currentUser), serverEpoch.toString());
          safeStorage.setItem(`user_${currentUser}_last_synced_millis`, serverEpoch.toString());
          lastLocalMutationTimeRef.current = serverEpoch;
          setLastLocalMutationTime(serverEpoch);

          setRenderKey(prev => prev + 1);
          setSyncConflictDetected(false);
          showToast("✓ Automatically resolved conflict by downloading latest Cloud state!");
        }
        return false;
      }

      if (response.ok) {
        const resData = await response.json();
        setSyncConflictDetected(false);
        if (resData.updatedAt) {
          setLastSyncedAt(resData.updatedAt);
          const syncEpoch = resData.last_synced_millis || new Date(resData.updatedAt).getTime();
          try {
            safeStorage.setItem(`last_local_mutation_${currentUser}`, syncEpoch.toString());
            safeStorage.setItem(getMutationKey(currentUser), syncEpoch.toString());
            safeStorage.setItem(`user_${currentUser}_last_synced_millis`, syncEpoch.toString());
            lastLocalMutationTimeRef.current = syncEpoch;
            setLastLocalMutationTime(syncEpoch);
          } catch (e) {}
        }
        showToast("✓ Secure Cloud Backup Complete!");
        return true;
      } else {
        const errJson = await response.json().catch(() => ({}));
        if (errJson && errJson.error && errJson.error.includes("Safeguard")) {
          console.warn("[Force Cloud Save] Server rejected empty sync payload safeguard.", errJson.error);
          showToast(`❌ Cloud Sync Safeguard: ${errJson.error}`);
          if (errJson.syncData) {
            const sd = errJson.syncData;
            const clients = Array.isArray(sd.clients) ? sd.clients : [];
            const products = Array.isArray(sd.products) ? sd.products : [];
            const estimates = Array.isArray(sd.estimates) ? sanitizeEstimates(sd.estimates) : [];

            setDbClients(clients);
            safeStorage.setItem(getClientsKey(currentUser), JSON.stringify(clients));

            setDbProducts(products);
            safeStorage.setItem(getProductsKey(currentUser), JSON.stringify(products));

            setDbEstimates(estimates);
            safeStorage.setItem(getEstimatesKey(currentUser), JSON.stringify(estimates));
            
            setRenderKey(prev => prev + 1);
            showToast("✓ Restored active data from Cloud safely!");
          }
        } else {
          showToast("⚠️ Cloud synchronization failed.");
        }
      }
    } catch (err) {
      console.warn("Cloud synchronization unreachable:", err);
      showToast("⚠️ Saved locally (Server offline). It will auto-sync later.");
    }
    return false;
  };

  // Unified dynamic sync pusher for Auto-Save-on-Action
  const triggerAutomaticCloudSave = async (
    updatedClients: Client[],
    updatedProducts: Product[],
    updatedEstimates: Estimate[],
    updatedStockLogs?: StockLog[]
  ) => {
    if (!currentUser) return;
    
    const activeLogs = updatedStockLogs || dbStockLogs;

    // Ensure local data is written to a verified, user-isolated key inside browser's persistent layer
    const dataSnapshot = {
      clients: updatedClients,
      products: updatedProducts,
      estimates: updatedEstimates,
      stockLogs: activeLogs,
      businessName,
      lastMutationTime: Date.now()
    };
    saveUserIsolatedData(currentUser, dataSnapshot);

    if (isForceOfflineActive) {
      console.log("[Auto-Save] Force offline active. Queuing sync payload.");
      setAutoSaveStatus('offline');
      addToOfflineSyncQueue(currentUser, {
        businessName,
        clients: updatedClients,
        products: updatedProducts,
        estimates: updatedEstimates,
        last_synced_millis: Date.now()
      });
      return;
    }

    const userMatched = dbUsers.find(u => u.phone === currentUser);
    if (!userMatched || !userMatched.password) {
      setAutoSaveStatus('error');
      return;
    }

    setAutoSaveStatus('saving');
    
    const now = Date.now();
    lastLocalMutationTimeRef.current = now;
    setLastLocalMutationTime(now);
    try {
      safeStorage.setItem(`last_local_mutation_${currentUser}`, now.toString());
      safeStorage.setItem(getMutationKey(currentUser), now.toString());
      safeStorage.setItem(`user_${currentUser}_last_synced_millis`, now.toString());
    } catch (e) {}

    const payload = {
      password: userMatched.password,
      businessName: businessName,
      clients: updatedClients,
      products: updatedProducts,
      estimates: updatedEstimates,
      last_synced_millis: now,
      force: getDeletedEstimateIds(currentUser).size > 0
    };

    if (isFirebaseConfigured() && currentUser) {
      pushUserSyncToFirestore(currentUser, {
        businessName,
        clients: updatedClients,
        products: updatedProducts,
        estimates: updatedEstimates,
        stockLogs: activeLogs,
        costFallbackPct,
        last_synced_millis: now
      }).catch(err => console.warn('[Firestore] Auto-save push warning:', err));
    }

    try {
      const response = await fetch(`/api/sync/${currentUser}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.status === 409) {
        console.warn("[Auto-Save] Conflict detected. Fetching server data...");
        const getResponse = await fetch(`/api/sync?phone=${encodeURIComponent(currentUser)}&password=${encodeURIComponent(userMatched.password)}`);
        if (getResponse.ok) {
          const syncData = await getResponse.json();
          const clients = Array.isArray(syncData.clients) ? syncData.clients : [];
          const serverProducts = Array.isArray(syncData.products) ? syncData.products : [];
          const estimates = Array.isArray(syncData.estimates)
            ? filterDeletedEstimates(sanitizeEstimates(syncData.estimates), currentUser)
            : [];

          // Merge server products with local updated products so newly auto-saved items are never lost
          const mergedProducts = [...serverProducts];
          updatedProducts.forEach(localP => {
            const existingIdx = mergedProducts.findIndex(p => p.id === localP.id || p.name.trim().toLowerCase() === localP.name.trim().toLowerCase());
            if (existingIdx === -1) {
              mergedProducts.push(localP);
            } else {
              mergedProducts[existingIdx] = { ...mergedProducts[existingIdx], ...localP };
            }
          });

          // Merge estimates (excluding any locally deleted bills)
          const mergedEstimates = filterDeletedEstimates([...estimates], currentUser);
          updatedEstimates.forEach(localEst => {
            if (!mergedEstimates.some(e => e.id === localEst.id)) {
              mergedEstimates.push(localEst);
            }
          });

          setDbClients(clients);
          safeStorage.setItem(getClientsKey(currentUser), JSON.stringify(clients));

          setDbProducts(mergedProducts);
          safeStorage.setItem(getProductsKey(currentUser), JSON.stringify(mergedProducts));
          safeStorage.setItem(`off_products_${currentUser}`, JSON.stringify(mergedProducts));
          safeStorage.setItem('off_products', JSON.stringify(mergedProducts));

          setDbEstimates(mergedEstimates);
          safeStorage.setItem(getEstimatesKey(currentUser), JSON.stringify(mergedEstimates));

          if (syncData.businessName) setBusinessName(syncData.businessName);
          if (syncData.updatedAt) setLastSyncedAt(syncData.updatedAt);

          const serverEpoch = syncData.last_synced_millis || (syncData.updatedAt ? new Date(syncData.updatedAt).getTime() : Date.now());
          safeStorage.setItem(getMutationKey(currentUser), serverEpoch.toString());
          safeStorage.setItem(`user_${currentUser}_last_synced_millis`, serverEpoch.toString());
          lastLocalMutationTimeRef.current = serverEpoch;
          setLastLocalMutationTime(serverEpoch);

          // Update user isolated key as well
          saveUserIsolatedData(currentUser, {
            clients,
            products: mergedProducts,
            estimates: mergedEstimates,
            stockLogs: activeLogs,
            businessName: syncData.businessName || businessName,
            lastMutationTime: serverEpoch
          });

          // Push merged data to server
          const followUpPayload = {
            password: userMatched.password,
            businessName: syncData.businessName || businessName,
            clients,
            products: mergedProducts,
            estimates: mergedEstimates,
            last_synced_millis: serverEpoch + 1000
          };
          fetch(`/api/sync/${currentUser}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(followUpPayload)
          }).catch(() => {});

          setRenderKey(prev => prev + 1);
          setSyncConflictDetected(false);
          setAutoSaveStatus('synced');
          removeFromOfflineSyncQueue(currentUser);
          showToast("✓ Auto-resolved conflict and synchronized data!");
        } else {
          setAutoSaveStatus('error');
        }
        return;
      }

      if (response.ok) {
        const resData = await response.json();
        setSyncConflictDetected(false);
        setAutoSaveStatus('synced');
        removeFromOfflineSyncQueue(currentUser);
        if (resData.updatedAt) {
          setLastSyncedAt(resData.updatedAt);
          const syncEpoch = resData.last_synced_millis || new Date(resData.updatedAt).getTime();
          try {
            safeStorage.setItem(`last_local_mutation_${currentUser}`, syncEpoch.toString());
            safeStorage.setItem(getMutationKey(currentUser), syncEpoch.toString());
            safeStorage.setItem(`user_${currentUser}_last_synced_millis`, syncEpoch.toString());
            lastLocalMutationTimeRef.current = syncEpoch;
            setLastLocalMutationTime(syncEpoch);
          } catch (e) {}
        }
        return;
      } else {
        const errJson = await response.json().catch(() => ({}));
        if (errJson && errJson.error && errJson.error.includes("Safeguard")) {
          console.warn("[Auto-Save] Server rejected payload.", errJson.error);
          showToast(`❌ Safeguard: ${errJson.error}`);
          setAutoSaveStatus('error');
          if (errJson.syncData) {
            const sd = errJson.syncData;
            const clients = Array.isArray(sd.clients) ? sd.clients : [];
            const products = Array.isArray(sd.products) ? sd.products : [];
            const estimates = Array.isArray(sd.estimates)
              ? filterDeletedEstimates(sanitizeEstimates(sd.estimates), currentUser)
              : [];

            setDbClients(clients);
            safeStorage.setItem(getClientsKey(currentUser), JSON.stringify(clients));

            setDbProducts(products);
            safeStorage.setItem(getProductsKey(currentUser), JSON.stringify(products));

            setDbEstimates(estimates);
            safeStorage.setItem(getEstimatesKey(currentUser), JSON.stringify(estimates));
            
            saveUserIsolatedData(currentUser, {
              clients,
              products,
              estimates,
              stockLogs: activeLogs,
              businessName,
              lastMutationTime: Date.now()
            });

            setRenderKey(prev => prev + 1);
            setAutoSaveStatus('synced');
            removeFromOfflineSyncQueue(currentUser);
          }
        } else {
          setAutoSaveStatus('offline');
          // Add to offline sync queue
          addToOfflineSyncQueue(currentUser, {
            businessName,
            clients: updatedClients,
            products: updatedProducts,
            estimates: updatedEstimates,
            last_synced_millis: now
          });
        }
      }
    } catch (err) {
      console.warn("[Auto-Save] Network error. Saving to offline queue.", err);
      setAutoSaveStatus('offline');
      addToOfflineSyncQueue(currentUser, {
        businessName,
        clients: updatedClients,
        products: updatedProducts,
        estimates: updatedEstimates,
        last_synced_millis: now
      });
    }
  };

  // Fail-Safe Offline Queue Processor Effect
  useEffect(() => {
    const processOfflineQueue = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setAutoSaveStatus('offline');
        return;
      }

      const queue = getOfflineSyncQueue();
      if (queue.length === 0) return;
      
      console.log(`[Online Handler] Network is online. Processing ${queue.length} pending offline sync payloads...`);
      setAutoSaveStatus('saving');
      
      let processedAny = false;
      // Process items in queue
      for (const item of queue) {
        const { mobileNumber, payload } = item;
        const userMatched = dbUsers.find(u => u.phone === mobileNumber);
        if (!userMatched || !userMatched.password) continue;

        // Sync directly to Firestore if configured
        if (isFirebaseConfigured()) {
          pushUserSyncToFirestore(mobileNumber, {
            businessName: payload.businessName || businessName,
            clients: payload.clients || [],
            products: payload.products || [],
            estimates: payload.estimates || [],
            stockLogs: payload.stockLogs || [],
            last_synced_millis: payload.last_synced_millis || Date.now()
          }).catch(err => console.warn('[Firestore] Queue push warning:', err?.message || err));
        }
        
        try {
          const response = await fetch(`/api/sync/${mobileNumber}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              password: userMatched.password,
              businessName: payload.businessName || businessName,
              clients: payload.clients,
              products: payload.products,
              estimates: payload.estimates,
              last_synced_millis: payload.last_synced_millis || Date.now()
            })
          });
          
          if (response.ok) {
            console.log(`[Offline Sync Queue] Successfully flushed sync payload for user: ${mobileNumber}`);
            removeFromOfflineSyncQueue(mobileNumber);
            processedAny = true;
          } else if (response.status === 409) {
            console.warn(`[Offline Sync Queue] Conflict detected for user: ${mobileNumber}, resolving...`);
            const getRes = await fetch(`/api/sync?phone=${encodeURIComponent(mobileNumber)}&password=${encodeURIComponent(userMatched.password)}`).catch(() => null);
            if (getRes && getRes.ok) {
              removeFromOfflineSyncQueue(mobileNumber);
              processedAny = true;
            }
          } else {
            console.warn(`[Offline Sync Queue] Pending sync payload for user: ${mobileNumber}, server returned status ${response.status}`);
          }
        } catch (error: any) {
          console.warn(`[Offline Sync Queue] Network offline or server unreachable for user: ${mobileNumber} (${error?.message || 'offline'}), will retry.`);
          // Keep it in queue if network is still failing
          setAutoSaveStatus('offline');
          return;
        }
      }
      
      setAutoSaveStatus('synced');
      if (processedAny) {
        showToast("📶 Internet Restored: Local bills auto-synced to cloud!");
      }
    };

    const handleOnline = () => {
      showToast("📶 Internet Restored: Local bills auto-synced to cloud!");
      processOfflineQueue();
    };

    const handleOffline = () => {
      setAutoSaveStatus('offline');
      showToast("📴 Offline Mode (Saved Locally)");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Periodically try to process queue if user is active
    const interval = setInterval(() => {
      if (navigator.onLine) {
        processOfflineQueue();
      }
    }, 30000); // Check every 30 seconds

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [dbUsers, businessName]);

  // Sync users list to store
  const handleUpdateUsers = (updatedUsers: User[]) => {
    setDbUsers((prev) => {
      const merged = [...prev];
      updatedUsers.forEach((u) => {
        const idx = merged.findIndex((m) => m.phone === u.phone);
        if (idx >= 0) {
          // If the new one has a valid non-placeholder password, or if existing is 'admin' or has no password
          if (u.password && u.password !== 'admin') {
            merged[idx] = u;
          } else if (!merged[idx].password || merged[idx].password === 'admin') {
            merged[idx] = { ...merged[idx], ...u };
          }
        } else {
          merged.push(u);
        }
      });
      try {
        safeStorage.setItem('off_users', JSON.stringify(merged));
      } catch (e) {}
      return merged;
    });
  };

  // Auth logins handler
  const handleLoginSuccess = async (phone: string, busName: string, role: 'admin' | 'clerk', password?: string) => {
    // Prevent leaking stale session states
    setDbClients([]);
    setDbProducts([]);
    setDbEstimates([]);
    setDbStockLogs([]);
    setIsInitialPullDone(false);

    // Migrate older keys to the new namespaced standard if present
    const isHealed = migrateOldKeysIfAny(phone);
    if (isHealed) {
      setTimeout(() => {
        showToast("🛡️ Self-healing: Lost database safely recovered from browser backup!");
      }, 500);
    }

    const clientsKey = getClientsKey(phone);
    const productsKey = getProductsKey(phone);
    const estimatesKey = getEstimatesKey(phone);
    const stockLogsKey = getStockLogsKey(phone);
    const mutationKey = getMutationKey(phone);
    const syncedOnceKey = getSyncedOnceKey(phone);
    const newlyRegisteredKey = getNewlyRegisteredKey(phone);

    setCurrentUser(phone);
    setBusinessName(busName);
    setCurrentUserRole(role);
    try {
      safeStorage.setItem('off_current_user', phone);
      safeStorage.setItem('off_current_user_role', role);
    } catch (e) {}
    if (role === 'clerk') {
      setCurrentTab('create_estimate');
    } else {
      setCurrentTab('dashboard');
    }

    setSyncMessage('Downloading your latest multi-device cloud backup. Please do not close or reload this window.');
    setIsSyncingLogin(true);
    showToast(`🔄 Logging in: Syncing cloud database...`);

    // Instant cloud synchronization pull upon successful login
    if (password) {
      try {
        const response = await fetch(`/api/sync/${phone}?password=${encodeURIComponent(password)}`);
        if (response.ok) {
          const syncData = await response.json();
          
          try {
            safeStorage.removeItem(newlyRegisteredKey);
          } catch (e) {}

          const clients = Array.isArray(syncData.clients) ? syncData.clients : [];
          const products = Array.isArray(syncData.products) ? syncData.products : [];
          const estimates = Array.isArray(syncData.estimates)
            ? filterDeletedEstimates(sanitizeEstimates(syncData.estimates), phone)
            : [];

          // Failsafe check: Prevent empty cloud server responses from overwriting populated local databases
          const localClients = JSON.parse(safeStorage.getItem(clientsKey) || '[]');
          const localProducts = JSON.parse(safeStorage.getItem(productsKey) || '[]');
          const localEstimates = filterDeletedEstimates(JSON.parse(safeStorage.getItem(estimatesKey) || '[]'), phone);

          const serverIsEmpty = clients.length === 0 && products.length === 0 && estimates.length === 0;
          const localHasData = localClients.length > 0 || localProducts.length > 0 || localEstimates.length > 0;

          if (serverIsEmpty && localHasData) {
            console.log("[Login Sync] Server contain empty lists but local storage has data. Retaining local data & syncing to cloud.");
            setDbClients(localClients);
            setDbProducts(localProducts);
            setDbEstimates(localEstimates);
            
            // Queue mutation to upload this data to the empty cloud database
            setTimeout(() => {
              registerLocalMutation();
            }, 1000);
          } else {
            const oldClientsKey = `off_clients_${phone}`;
            const oldProductsKey = `off_products_${phone}`;
            const oldEstimatesKey = `off_estimates_${phone}`;

            setDbClients(clients);
            safeStorage.setItem(clientsKey, JSON.stringify(clients));
            safeStorage.setItem(oldClientsKey, JSON.stringify(clients));

            setDbProducts(products);
            safeStorage.setItem(productsKey, JSON.stringify(products));
            safeStorage.setItem(oldProductsKey, JSON.stringify(products));

            setDbEstimates(estimates);
            safeStorage.setItem(estimatesKey, JSON.stringify(estimates));
            safeStorage.setItem(oldEstimatesKey, JSON.stringify(estimates));
          }

          if (syncData.businessName) {
            setBusinessName(syncData.businessName);
          }
          if (syncData.updatedAt) {
            setLastSyncedAt(syncData.updatedAt);
          }
          
          const serverEpoch = syncData.last_synced_millis || (syncData.updatedAt ? new Date(syncData.updatedAt).getTime() : Date.now());
          safeStorage.setItem(mutationKey, serverEpoch.toString());
          safeStorage.setItem(`user_${phone}_last_synced_millis`, serverEpoch.toString());
          lastLocalMutationTimeRef.current = serverEpoch;
          setLastLocalMutationTime(serverEpoch);
          
          try {
            safeStorage.setItem(syncedOnceKey, 'true');
          } catch (e) {}
          
          // Trigger immediate hard re-render on successful download sync
          setRenderKey(prev => prev + 1);
          showToast("✓ Cloud Data Sync complete!");
        } else {
          // Fallback to local storage if server response not OK
          try {
            setDbClients(JSON.parse(safeStorage.getItem(clientsKey) || '[]'));
            setDbProducts(JSON.parse(safeStorage.getItem(productsKey) || '[]'));
            setDbEstimates(sanitizeEstimates(JSON.parse(safeStorage.getItem(estimatesKey) || '[]')));
            setDbStockLogs(JSON.parse(safeStorage.getItem(stockLogsKey) || '[]'));
          } catch (e) {}
        }
      } catch (err) {
        console.warn("Could not sync cloud data on login:", err);
        // Fallback to local storage if offline
        try {
          setDbClients(JSON.parse(safeStorage.getItem(clientsKey) || '[]'));
          setDbProducts(JSON.parse(safeStorage.getItem(productsKey) || '[]'));
          setDbEstimates(sanitizeEstimates(JSON.parse(safeStorage.getItem(estimatesKey) || '[]')));
          setDbStockLogs(JSON.parse(safeStorage.getItem(stockLogsKey) || '[]'));
        } catch (e) {}
      } finally {
        setIsInitialPullDone(true);
        setIsSyncingLogin(false);
      }
    } else {
      // No password provided, fallback to local storage
      try {
        setDbClients(JSON.parse(safeStorage.getItem(clientsKey) || '[]'));
        setDbProducts(JSON.parse(safeStorage.getItem(productsKey) || '[]'));
        setDbEstimates(sanitizeEstimates(JSON.parse(safeStorage.getItem(estimatesKey) || '[]')));
        setDbStockLogs(JSON.parse(safeStorage.getItem(stockLogsKey) || '[]'));
      } catch (e) {}
      setIsInitialPullDone(true);
      setIsSyncingLogin(false);
    }
  };

  // Background Auto-sync whenever local database properties update (debentured/delayed PWA behaviour)
  useEffect(() => {
    if (isForceOfflineActive) return;
    if (!currentUser || !isInitialPullDone) return;
    const userMatched = dbUsers.find(u => u.phone === currentUser);
    if (!userMatched || !userMatched.password) return;

    lastLocalMutationTimeRef.current = Date.now();
    isPendingPushRef.current = true;

    const timer = setTimeout(async () => {
      try {
        const localEpoch = Number(safeStorage.getItem(`user_${currentUser}_last_synced_millis`)) || lastLocalMutationTimeRef.current || Date.now();
        const payload = {
          password: userMatched.password,
          businessName: businessName,
          clients: dbClients,
          products: dbProducts,
          estimates: dbEstimates,
          last_synced_millis: localEpoch,
          force: getDeletedEstimateIds(currentUser).size > 0
        };

        const response = await fetch(`/api/sync/${currentUser}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (response.status === 409) {
          console.warn("[Auto-Sync Conflict] Server has newer data. Pausing auto-sync.");
          showToast("⚠️ Sync conflict: Server has newer data. Click manual Sync to resolve.");
          setSyncConflictDetected(true);
          return;
        }

        if (response.ok) {
          const resData = await response.json();
          setSyncConflictDetected(false);
          if (resData.updatedAt) {
            setLastSyncedAt(resData.updatedAt);
            const syncEpoch = resData.last_synced_millis || new Date(resData.updatedAt).getTime();
            try {
              safeStorage.setItem(`last_local_mutation_${currentUser}`, syncEpoch.toString());
              safeStorage.setItem(getMutationKey(currentUser), syncEpoch.toString());
              safeStorage.setItem(`user_${currentUser}_last_synced_millis`, syncEpoch.toString());
              lastLocalMutationTimeRef.current = syncEpoch;
              setLastLocalMutationTime(syncEpoch);
            } catch (e) {}
          }
        }
      } catch (err) {
        console.warn("Auto-sync background upload skipped (offline active)");
      } finally {
        isPendingPushRef.current = false;
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [dbClients, dbProducts, dbEstimates, currentUser, businessName, dbUsers, isInitialPullDone, isForceOfflineActive]);

  // Manual Multi-device Sync request handler
  const handleSyncDataWithServer = async () => {
    if (!currentUser) return;
    const userMatched = dbUsers.find(u => u.phone === currentUser);
    if (!userMatched || !userMatched.password) {
      showToast("Sync Error: Profile is incomplete");
      return;
    }

    isPendingPushRef.current = true;

    try {
      showToast("🔄 Syncing with server...");
      
      const localEpoch = Number(safeStorage.getItem(`user_${currentUser}_last_synced_millis`)) || lastLocalMutationTimeRef.current || Date.now();
      const payload = {
        password: userMatched.password,
        businessName: businessName,
        clients: dbClients,
        products: dbProducts,
        estimates: dbEstimates,
        last_synced_millis: localEpoch
      };

      const postResponse = await fetch(`/api/sync/${currentUser}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (postResponse.status === 409) {
        showToast("⚠️ Conflict! Server has newer data.");
        setSyncConflictDetected(true);
        const confirmDownload = await requestConfirm({
          title: 'Cloud Sync Conflict Detected',
          message: 'A newer database backup was found on the cloud server. Would you like to download the latest server state to prevent overwriting newer records?',
          confirmText: 'Download Server Data',
          cancelText: 'Keep Local',
          variant: 'warning',
        });
        if (confirmDownload) {
          const getResponse = await fetch(`/api/sync?phone=${encodeURIComponent(currentUser)}&password=${encodeURIComponent(userMatched.password)}`);
          if (getResponse.ok) {
            const syncData = await getResponse.json();
            const clients = Array.isArray(syncData.clients) ? syncData.clients : [];
            const products = Array.isArray(syncData.products) ? syncData.products : [];
            const estimates = Array.isArray(syncData.estimates) ? sanitizeEstimates(syncData.estimates) : [];

            setDbClients(clients);
            safeStorage.setItem(getClientsKey(currentUser), JSON.stringify(clients));

            setDbProducts(products);
            safeStorage.setItem(getProductsKey(currentUser), JSON.stringify(products));

            setDbEstimates(estimates);
            safeStorage.setItem(getEstimatesKey(currentUser), JSON.stringify(estimates));

            if (syncData.businessName) {
              setBusinessName(syncData.businessName);
            }
            if (syncData.updatedAt) {
              setLastSyncedAt(syncData.updatedAt);
            }

            const serverEpoch = syncData.last_synced_millis || (syncData.updatedAt ? new Date(syncData.updatedAt).getTime() : Date.now());
            safeStorage.setItem(getMutationKey(currentUser), serverEpoch.toString());
            safeStorage.setItem(`user_${currentUser}_last_synced_millis`, serverEpoch.toString());
            lastLocalMutationTimeRef.current = serverEpoch;
            setLastLocalMutationTime(serverEpoch);

            setRenderKey(prev => prev + 1);
            showToast("✓ Updated to latest Server backup!");
            setSyncConflictDetected(false);
          } else {
            showToast("Failed to retrieve Server backup.");
          }
        }
        return;
      }

      if (postResponse.ok) {
        const resData = await postResponse.json();
        const syncEpoch = resData.last_synced_millis || (resData.updatedAt ? new Date(resData.updatedAt).getTime() : Date.now());
        if (resData.updatedAt) {
          setLastSyncedAt(resData.updatedAt);
        }
        try {
          safeStorage.setItem(`last_local_mutation_${currentUser}`, syncEpoch.toString());
          safeStorage.setItem(getMutationKey(currentUser), syncEpoch.toString());
          safeStorage.setItem(`user_${currentUser}_last_synced_millis`, syncEpoch.toString());
          lastLocalMutationTimeRef.current = syncEpoch;
          setLastLocalMutationTime(syncEpoch);
        } catch (e) {}
        setSyncConflictDetected(false);
        showToast("✓ Multi-Device Sync successful!");
      } else {
        showToast("Sync error: Server authentication failed.");
      }
    } catch (e) {
      showToast("Sync issue: Server unreachable (Offline).");
    } finally {
      isPendingPushRef.current = false;
    }
  };

  const handleResolveConflict = async (resolution: 'server' | 'local') => {
    if (!currentUser) return;
    const userMatched = dbUsers.find(u => u.phone === currentUser);
    if (!userMatched || !userMatched.password) return;

    try {
      if (resolution === 'server') {
        showToast("🔄 Fetching latest data from server...");
        const getResponse = await fetch(`/api/sync?phone=${encodeURIComponent(currentUser)}&password=${encodeURIComponent(userMatched.password)}`);
        if (getResponse.ok) {
          const syncData = await getResponse.json();
          const clients = Array.isArray(syncData.clients) ? syncData.clients : [];
          const products = Array.isArray(syncData.products) ? syncData.products : [];
          const estimates = Array.isArray(syncData.estimates) ? sanitizeEstimates(syncData.estimates) : [];

          setDbClients(clients);
          safeStorage.setItem(getClientsKey(currentUser), JSON.stringify(clients));

          setDbProducts(products);
          safeStorage.setItem(getProductsKey(currentUser), JSON.stringify(products));

          setDbEstimates(estimates);
          safeStorage.setItem(getEstimatesKey(currentUser), JSON.stringify(estimates));

          if (syncData.businessName) {
            setBusinessName(syncData.businessName);
          }
          if (syncData.updatedAt) {
            setLastSyncedAt(syncData.updatedAt);
          }

          const serverEpoch = syncData.last_synced_millis || (syncData.updatedAt ? new Date(syncData.updatedAt).getTime() : Date.now());
          safeStorage.setItem(getMutationKey(currentUser), serverEpoch.toString());
          safeStorage.setItem(`user_${currentUser}_last_synced_millis`, serverEpoch.toString());
          lastLocalMutationTimeRef.current = serverEpoch;
          setLastLocalMutationTime(serverEpoch);

          setRenderKey(prev => prev + 1);
          setSyncConflictDetected(false);
          showToast("✓ Successfully updated to latest Server data!");
        } else {
          showToast("Failed to retrieve Server data.");
        }
      } else if (resolution === 'local') {
        showToast("🔄 Force uploading local data...");
        const newEpoch = Date.now() + 1000;
        
        const payload = {
          password: userMatched.password,
          businessName: businessName,
          clients: dbClients,
          products: dbProducts,
          estimates: dbEstimates,
          last_synced_millis: newEpoch
        };

        const response = await fetch(`/api/sync/${currentUser}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const resData = await response.json();
          const syncEpoch = resData.last_synced_millis || newEpoch;
          
          safeStorage.setItem(`last_local_mutation_${currentUser}`, syncEpoch.toString());
          safeStorage.setItem(getMutationKey(currentUser), syncEpoch.toString());
          safeStorage.setItem(`user_${currentUser}_last_synced_millis`, syncEpoch.toString());
          lastLocalMutationTimeRef.current = syncEpoch;
          setLastLocalMutationTime(syncEpoch);

          setSyncConflictDetected(false);
          showToast("✓ Server overwritten successfully with your local data!");
        } else {
          showToast("Failed to overwrite server data.");
        }
      }
    } catch (err) {
      showToast("Error resolving conflict: Server unreachable.");
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    try {
      safeStorage.removeItem('off_current_user');
    } catch (e) {}
    setEditingEstimateId(null);
    setActivePrintEstimate(null);
    setCurrentTab('dashboard');
    showToast("Logged out successfully!");
  };

  const saveClientsToAllStorage = (updated: Client[]) => {
    setDbClients(updated);
    try {
      if (currentUser) {
        safeStorage.setItem(getClientsKey(currentUser), JSON.stringify(updated));
        safeStorage.setItem(`off_clients_${currentUser}`, JSON.stringify(updated));
        safeStorage.setItem(`user_${currentUser}_clients`, JSON.stringify(updated));
        saveUserIsolatedData(currentUser, { clients: updated, products: dbProducts, estimates: dbEstimates });
      }
      safeStorage.setItem('off_clients', JSON.stringify(updated));
    } catch (e) {}
  };

  // Client registries additions
  const handleAddNewClient = async (c: Client) => {
    const updated = [...dbClients, c];
    saveClientsToAllStorage(updated);
    registerLocalMutation();
    triggerAutomaticCloudSave(updated, dbProducts, dbEstimates);
    showToast("Customer profile saved successfully!");
  };

  const handleEditClient = async (updatedClient: Client) => {
    const updated = dbClients.map(c => c.id === updatedClient.id ? updatedClient : c);
    saveClientsToAllStorage(updated);
    registerLocalMutation();
    triggerAutomaticCloudSave(updated, dbProducts, dbEstimates);
    showToast("Customer updated successfully!");
  };

  const handleDeleteClient = async (id: number) => {
    const matchedClient = dbClients.find(c => c.id === id);
    const confirmation = await requestConfirm({
      title: 'Delete Party / Customer',
      message: `Are you sure you want to delete customer "${matchedClient?.name || 'this party'}"?`,
      confirmText: 'Delete Party',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmation) return;

    const updated = dbClients.filter(c => c.id !== id);
    saveClientsToAllStorage(updated);
    registerLocalMutation();
    triggerAutomaticCloudSave(updated, dbProducts, dbEstimates);
    showToast("Customer deleted successfully!");
  };

  const handleUpdateClientPayments = async (clientId: number, openingBalance: number, payments: PaymentRecord[]) => {
    const updated = dbClients.map(c => {
      if (c.id === clientId) {
        return {
          ...c,
          openingBalance,
          payments
        };
      }
      return c;
    });
    saveClientsToAllStorage(updated);
    registerLocalMutation();
    triggerAutomaticCloudSave(updated, dbProducts, dbEstimates);
    showToast("Customer ledger updated successfully!");
  };

  // Product register additions
  const handleAddNewProduct = async (p: Product) => {
    let updated: Product[] = [];
    setDbProducts(prev => {
      const exists = prev.some(item => item.id === p.id || item.name.trim().toLowerCase() === p.name.trim().toLowerCase());
      if (exists) {
        updated = prev.map(item => (item.id === p.id || item.name.trim().toLowerCase() === p.name.trim().toLowerCase()) ? { ...item, ...p } : item);
      } else {
        updated = [...prev, p];
      }
      try {
        const storageKey = currentUser ? `off_products_${currentUser}` : 'off_products';
        safeStorage.setItem(storageKey, JSON.stringify(updated));
        if (currentUser) {
          safeStorage.setItem(getProductsKey(currentUser), JSON.stringify(updated));
        }
      } catch (e) {}
      return updated;
    });

    // Log stock event
    const initLog: StockLog = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      type: 'INITIAL',
      qty: p.stock,
      prevStock: 0,
      newStock: p.stock,
      date: new Date().toISOString().split('T')[0],
      reference: 'Opening Stock',
      price: p.purchasePrice || p.price * (costFallbackPct / 100)
    };
    const updatedLogs = [initLog, ...dbStockLogs];
    setDbStockLogs(updatedLogs);
    try {
      const stockLogsKey = `off_stock_logs_${currentUser}`;
      safeStorage.setItem(stockLogsKey, JSON.stringify(updatedLogs));
      if (currentUser) {
        safeStorage.setItem(getStockLogsKey(currentUser), JSON.stringify(updatedLogs));
      }
    } catch (e) {}

    registerLocalMutation();
    triggerAutomaticCloudSave(dbClients, updated.length > 0 ? updated : [...dbProducts, p], dbEstimates, updatedLogs);
    showToast("New product saved successfully!");
  };

  const handleDeleteProduct = async (id: number) => {
    const matched = dbProducts.find(p => p.id === id);
    const confirmation = await requestConfirm({
      title: 'Delete Inventory Item',
      message: `Are you sure you want to delete "${matched?.name || 'this product'}" from inventory?`,
      confirmText: 'Delete Item',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmation) return;

    const updated = dbProducts.filter(p => p.id !== id);
    setDbProducts(updated);
    try {
      const storageKey = currentUser ? `off_products_${currentUser}` : 'off_products';
      safeStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {}

    let updatedLogs = dbStockLogs;
    if (matched) {
      // Log stock removal adjustment
      const changeLog: StockLog = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        productId: matched.id,
        productName: matched.name,
        sku: matched.sku,
        type: 'ADJUSTMENT',
        qty: matched.stock,
        prevStock: matched.stock,
        newStock: 0,
        date: new Date().toISOString().split('T')[0],
        reference: 'Product Deletion',
        price: matched.purchasePrice || matched.price * (costFallbackPct / 100)
      };
      updatedLogs = [changeLog, ...dbStockLogs];
      setDbStockLogs(updatedLogs);
      try {
        const stockLogsKey = `off_stock_logs_${currentUser}`;
        safeStorage.setItem(stockLogsKey, JSON.stringify(updatedLogs));
      } catch (e) {}
    }

    registerLocalMutation();
    triggerAutomaticCloudSave(dbClients, updated, dbEstimates, updatedLogs);
    showToast("Product deleted successfully!");
  };

  // Incremental Bulk Stock updates
  const handleBulkStockAdd = async (adjustments: { [key: number]: number }) => {
    const newLogs: StockLog[] = [];
    const updated = dbProducts.map(p => {
      const added = adjustments[p.id] || 0;
      if (added > 0) {
        newLogs.push({
          id: Date.now() + Math.floor(Math.random() * 100000) + p.id,
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          type: 'INCOMING',
          qty: added,
          prevStock: p.stock,
          newStock: p.stock + added,
          date: new Date().toISOString().split('T')[0],
          reference: 'Manual Bulk Addition',
          price: p.purchasePrice || p.price * (costFallbackPct / 100)
        });
        return { ...p, stock: p.stock + added };
      }
      return p;
    });
    setDbProducts(updated);
    try {
      const storageKey = currentUser ? `off_products_${currentUser}` : 'off_products';
      safeStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {}

    let updatedLogs = dbStockLogs;
    if (newLogs.length > 0) {
      updatedLogs = [...newLogs, ...dbStockLogs];
      setDbStockLogs(updatedLogs);
      try {
        const stockLogsKey = `off_stock_logs_${currentUser}`;
        safeStorage.setItem(stockLogsKey, JSON.stringify(updatedLogs));
      } catch (e) {}
    }

    registerLocalMutation();
    triggerAutomaticCloudSave(dbClients, updated, dbEstimates, updatedLogs);
    showToast("Stock ledger details updated successfully!");
  };

  const handleBulkRegProducts = async (newProds: Product[]) => {
    const updated = sanitizeProducts([...dbProducts, ...newProds]);
    setDbProducts(updated);
    try {
      const storageKey = currentUser ? `off_products_${currentUser}` : 'off_products';
      safeStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {}

    const newLogs: StockLog[] = newProds.map((p, idx) => ({
      id: Date.now() + idx + Math.floor(Math.random() * 1000),
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      type: 'INITIAL',
      qty: p.stock,
      prevStock: 0,
      newStock: p.stock,
      date: new Date().toISOString().split('T')[0],
      reference: 'Bulk Spreadsheet Upload',
      price: p.purchasePrice || p.price * (costFallbackPct / 100)
    }));
    const updatedLogs = [...newLogs, ...dbStockLogs];
    setDbStockLogs(updatedLogs);
    try {
      const stockLogsKey = `off_stock_logs_${currentUser}`;
      safeStorage.setItem(stockLogsKey, JSON.stringify(updatedLogs));
    } catch (e) {}

    registerLocalMutation();
    triggerAutomaticCloudSave(dbClients, updated, dbEstimates, updatedLogs);
    showToast(`Successfully registered ${newProds.length} new products!`);
  };

  const handleBatchAddProducts = async (items: any[]) => {
    let addedCount = 0;
    let updatedCount = 0;
    const currentProducts = [...dbProducts];
    const newLogs: StockLog[] = [];

    (items || []).forEach(item => {
      if (!item || !item.name) return;
      
      const cleanItemName = String(item.name).trim();
      if (!cleanItemName) return;

      const matchedIdx = currentProducts.findIndex(p => p && p.name && p.name.trim().toLowerCase() === cleanItemName.toLowerCase());
      if (matchedIdx >= 0) {
        const prevStock = currentProducts[matchedIdx].stock || 0;
        const addedQty = Number(item.stock || 0);
        const newStock = prevStock + addedQty;

        currentProducts[matchedIdx] = {
          ...currentProducts[matchedIdx],
          stock: newStock,
          price: Number(item.price || 0) > 0 ? Number(item.price) : currentProducts[matchedIdx].price,
          mrp: Number(item.mrp || 0) > 0 ? Number(item.mrp) : currentProducts[matchedIdx].mrp,
          purchasePrice: Number(item.purchasePrice || 0) > 0 ? Number(item.purchasePrice) : (currentProducts[matchedIdx].purchasePrice || Math.round(Number(item.price || 0) * (costFallbackPct / 100))),
          discount: item.discount !== undefined ? Number(item.discount) : currentProducts[matchedIdx].discount
        };

        if (addedQty > 0) {
          newLogs.push({
            id: Date.now() + Math.floor(Math.random() * 1000000),
            productId: currentProducts[matchedIdx].id,
            productName: currentProducts[matchedIdx].name,
            sku: currentProducts[matchedIdx].sku,
            type: 'INCOMING',
            qty: addedQty,
            prevStock,
            newStock,
            date: new Date().toISOString().split('T')[0],
            reference: 'Batch Purchase Scan',
            price: currentProducts[matchedIdx].purchasePrice
          });
        }
        updatedCount++;
      } else {
        const finalPrice = Number(item.price || 0);
        const finalMRP = Number(item.mrp || finalPrice || 0);
        const finalPurchasePrice = Number(item.purchasePrice || finalPrice * (costFallbackPct / 100) || 0);
        const initialQty = Number(item.stock || 0);
        
        const newProd: Product = {
          id: Math.floor(Date.now() + Math.random() * 100000),
          name: cleanItemName,
          sku: item.sku?.trim() || `SKU-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 105)}`,
          unit: item.unit || "Pcs",
          stock: initialQty,
          price: finalPrice,
          mrp: finalMRP,
          purchasePrice: finalPurchasePrice,
          discount: item.discount !== undefined ? Number(item.discount) : 0
        };
        currentProducts.push(newProd);

        newLogs.push({
          id: Date.now() + Math.floor(Math.random() * 1000000),
          productId: newProd.id,
          productName: newProd.name,
          sku: newProd.sku,
          type: 'INITIAL',
          qty: initialQty,
          prevStock: 0,
          newStock: initialQty,
          date: new Date().toISOString().split('T')[0],
          reference: 'Batch Import Registration',
          price: finalPurchasePrice
        });
        addedCount++;
      }
    });

    setDbProducts(currentProducts);
    try {
      const storageKey = currentUser ? `off_products_${currentUser}` : 'off_products';
      safeStorage.setItem(storageKey, JSON.stringify(currentProducts));
    } catch (e) {}

    let updatedLogs = dbStockLogs;
    if (newLogs.length > 0) {
      updatedLogs = [...newLogs, ...dbStockLogs];
      setDbStockLogs(updatedLogs);
      try {
        const stockLogsKey = `off_stock_logs_${currentUser}`;
        safeStorage.setItem(stockLogsKey, JSON.stringify(updatedLogs));
      } catch (e) {}
    }

    registerLocalMutation();
    triggerAutomaticCloudSave(dbClients, currentProducts, dbEstimates, updatedLogs);
    showToast(`Batch Import Complete! Added ${addedCount} new items, updated stock for ${updatedCount} existing items.`);
  };

  const handleEditProduct = async (updatedProd: Product) => {
    const oldProd = dbProducts.find(p => p.id === updatedProd.id);
    const updated = dbProducts.map(p => p.id === updatedProd.id ? updatedProd : p);
    setDbProducts(updated);
    try {
      const storageKey = currentUser ? `off_products_${currentUser}` : 'off_products';
      safeStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {}

    let updatedLogs = dbStockLogs;
    if (oldProd && oldProd.stock !== updatedProd.stock) {
      const diff = updatedProd.stock - oldProd.stock;
      const changeLog: StockLog = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        productId: updatedProd.id,
        productName: updatedProd.name,
        sku: updatedProd.sku,
        type: 'ADJUSTMENT',
        qty: Math.abs(diff),
        prevStock: oldProd.stock,
        newStock: updatedProd.stock,
        date: new Date().toISOString().split('T')[0],
        reference: 'Manual Profile Edit',
        price: updatedProd.purchasePrice || updatedProd.price * (costFallbackPct / 100)
      };
      updatedLogs = [changeLog, ...dbStockLogs];
      setDbStockLogs(updatedLogs);
      try {
        const stockLogsKey = `off_stock_logs_${currentUser}`;
        safeStorage.setItem(stockLogsKey, JSON.stringify(updatedLogs));
      } catch (e) {}
    }

    registerLocalMutation();
    triggerAutomaticCloudSave(dbClients, updated, dbEstimates, updatedLogs);
    showToast("Product updated successfully!");
  };

  const handleGlobalPriceMarkup = async (markupPct: number) => {
    if (!Number.isFinite(markupPct) || markupPct === 0) return;
    if (dbProducts.length === 0) {
      showToast("⚠️ No products in inventory to update.");
      return;
    }

    const factor = 1 + markupPct / 100;
    const todayStr = new Date().toISOString().split('T')[0];
    const newLogs: StockLog[] = [];

    const updatedProducts = dbProducts.map((p, idx) => {
      const oldPrice = Number(p.price) || 0;
      const oldMrp = Number(p.mrp) || 0;
      const newPrice = Math.max(0, Math.round(oldPrice * factor));
      const newMrp = oldMrp > 0 ? Math.max(newPrice, Math.round(oldMrp * factor)) : newPrice;
      const newDiscount =
        newMrp > newPrice && newMrp > 0
          ? Math.round(((newMrp - newPrice) / newMrp) * 100)
          : p.discount || 0;

      if (idx < 50) {
        newLogs.push({
          id: Date.now() + idx + Math.floor(Math.random() * 100000),
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          type: 'ADJUSTMENT',
          qty: 0,
          prevStock: p.stock,
          newStock: p.stock,
          date: todayStr,
          reference: `Global Markup (${markupPct > 0 ? '+' : ''}${markupPct}%): Sale ₹${oldPrice}→₹${newPrice}, MRP ₹${oldMrp}→₹${newMrp}`,
          price: newPrice,
        });
      }

      return {
        ...p,
        price: newPrice,
        mrp: newMrp,
        discount: newDiscount,
      };
    });

    setDbProducts(updatedProducts);
    try {
      const storageKey = currentUser ? `off_products_${currentUser}` : 'off_products';
      safeStorage.setItem(storageKey, JSON.stringify(updatedProducts));
      safeStorage.setItem('off_products', JSON.stringify(updatedProducts));
      if (currentUser) {
        safeStorage.setItem(getProductsKey(currentUser), JSON.stringify(updatedProducts));
        safeStorage.setItem(`user_${currentUser}_products`, JSON.stringify(updatedProducts));
      }
    } catch (e) {}

    const updatedLogs = [...newLogs, ...dbStockLogs];
    setDbStockLogs(updatedLogs);
    try {
      const stockLogsKey = `off_stock_logs_${currentUser}`;
      safeStorage.setItem(stockLogsKey, JSON.stringify(updatedLogs));
      if (currentUser) {
        safeStorage.setItem(getStockLogsKey(currentUser), JSON.stringify(updatedLogs));
      }
    } catch (e) {}

    registerLocalMutation();
    triggerAutomaticCloudSave(dbClients, updatedProducts, dbEstimates, updatedLogs);
    showToast(
      `✓ Global Price Markup (${markupPct > 0 ? '+' : ''}${markupPct}%) applied to ${updatedProducts.length} products!`
    );
  };

  const handleScanBillImage = async (base64Image: string): Promise<Product[] | undefined> => {
    setIsScanning(true);
    const customApiKey = localStorage.getItem("custom_gemini_api_key") || "";
    try {
      const res = await fetch("/api/scan-bill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ image: base64Image, customApiKey })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to parse purchase bill.");
      }

      const data = await res.json();
      if (!data.success || !Array.isArray(data.items)) {
        throw new Error("Invalid response format from server scan.");
      }

      const scannedItems: Product[] = data.items;
      if (scannedItems.length === 0) {
        showToast("No products found in the scanned purchase bill.");
        return [];
      }

      // Merge items into dbProducts
      // Merge by case-insensitive name matching
      let addedCount = 0;
      let updatedCount = 0;
      const currentProducts = [...dbProducts];

      scannedItems.forEach(item => {
        const matchedIdx = currentProducts.findIndex(p => p.name.trim().toLowerCase() === item.name.trim().toLowerCase());
        if (matchedIdx >= 0) {
          // Exists: add stock, update price, MRP
          currentProducts[matchedIdx] = {
            ...currentProducts[matchedIdx],
            stock: currentProducts[matchedIdx].stock + item.stock,
            price: item.price > 0 ? item.price : currentProducts[matchedIdx].price,
            mrp: item.mrp > 0 ? item.mrp : currentProducts[matchedIdx].mrp,
          };
          updatedCount++;
        } else {
          // New: create new product
          const newProd: Product = {
            id: Date.now() + Math.random(),
            name: item.name.trim(),
            sku: item.sku?.trim() || `SKU-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 100)}`,
            unit: item.unit || "Pcs",
            stock: item.stock,
            price: item.price,
            mrp: (item.mrp && Number(item.mrp) > 0) ? Number(item.mrp) : 0
          };
          currentProducts.push(newProd);
          addedCount++;
        }
      });

      setDbProducts(currentProducts);
      try {
        const storageKey = currentUser ? `off_products_${currentUser}` : 'off_products';
        safeStorage.setItem(storageKey, JSON.stringify(currentProducts));
      } catch (e) {}

      showToast(`Scan complete! Added ${addedCount} new items, updated stock for ${updatedCount} existing items.`);
      return scannedItems;
    } catch (err: any) {
      console.error("Scanning bill error:", err);
      alert(`Error reading bill: ${err.message}`);
      return undefined;
    } finally {
      setIsScanning(false);
    }
  };

  // Estimate bills operations
  const handleSaveInvoice = async (payload: Estimate, openPrint: boolean = true, stayOnNewBill: boolean = false) => {
    let updatedEstimates = [...dbEstimates];
    const newLogs: StockLog[] = [];

    // Retrieve latest products to prevent stale closures
    let baseProducts: Product[] = [...dbProducts];
    try {
      const stored = safeStorage.getItem(getProductsKey(currentUser || '')) || 
                     safeStorage.getItem(`off_products_${currentUser}`) || 
                     safeStorage.getItem('off_products');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const mergedBase = [...baseProducts];
          parsed.forEach((p: Product) => {
            const idx = mergedBase.findIndex(mb => mb.id === p.id || mb.name.trim().toLowerCase() === p.name.trim().toLowerCase());
            if (idx === -1) {
              mergedBase.push(p);
            } else {
              mergedBase[idx] = { ...mergedBase[idx], ...p };
            }
          });
          baseProducts = mergedBase;
        }
      }
    } catch (e) {}

    const updatedProductsList = [...baseProducts];

    // Dynamic stock reversion logic: if editing old estimate, revert previous quantities checks
    if (editingEstimateId !== null) {
      const oldEst = dbEstimates.find(e => e.id === editingEstimateId);
      if (oldEst) {
        oldEst.items.forEach(oldIt => {
          let stockProd = updatedProductsList.find(p => p.name.trim().toLowerCase() === oldIt.name.trim().toLowerCase());
          if (stockProd) {
            newLogs.push({
              id: Date.now() + Math.floor(Math.random() * 1000000) + stockProd.id,
              productId: stockProd.id,
              productName: stockProd.name,
              sku: stockProd.sku,
              type: 'RETURN',
              qty: oldIt.qty,
              prevStock: stockProd.stock,
              newStock: stockProd.stock + oldIt.qty,
              date: new Date().toISOString().split('T')[0],
              reference: `Edit Reversion of Bill ${oldEst.serial}`,
              price: oldIt.purchasePrice || stockProd.purchasePrice || stockProd.price * (costFallbackPct / 100)
            });
            stockProd.stock += oldIt.qty;
          }
        });
      }
    }

    // Deduct stock levels on main product ledgers matching row item inputs, and auto-register new items
    payload.items.forEach(it => {
      const cleanName = (it.name || '').trim();
      if (!cleanName) return;

      const soldQty = Number(it.qty) || 1;
      let stockItem = updatedProductsList.find(p => p.name.trim().toLowerCase() === cleanName.toLowerCase());
      if (!stockItem) {
        // Auto create and register new item into Inventory (default 10 opening stock, or soldQty + 5 so stock stays positive)
        const initialStock = Math.max(10, soldQty + 5);
        const purchaseCost = it.purchasePrice || (it.price ? Math.round(it.price * (costFallbackPct / 100)) : 0);
        stockItem = {
          id: Math.floor(Date.now() + Math.random() * 100000),
          name: cleanName,
          sku: `SKU-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 100)}`,
          unit: it.unit || 'Pcs',
          stock: initialStock,
          price: Number(it.price) || 0,
          mrp: (it.mrp && Number(it.mrp) > 0) ? Number(it.mrp) : 0,
          purchasePrice: purchaseCost,
          discount: Number(it.disc) || 0
        };
        updatedProductsList.push(stockItem);

        // Initial opening stock log
        newLogs.push({
          id: Date.now() + Math.floor(Math.random() * 1000000) + stockItem.id,
          productId: stockItem.id,
          productName: stockItem.name,
          sku: stockItem.sku,
          type: 'INITIAL',
          qty: initialStock,
          prevStock: 0,
          newStock: initialStock,
          date: new Date().toISOString().split('T')[0],
          reference: 'Auto-Saved to Inventory from Bill',
          price: purchaseCost
        });
      } else {
        // User requested: If MRP or Selling Price is edited while creating a bill, persist it into master stock!
        const billPrice = Number(it.price) || 0;
        const billMrp = (it.mrp && Number(it.mrp) > 0) ? Number(it.mrp) : 0;
        let rateOrMrpChanged = false;
        const oldPrice = stockItem.price;
        const oldMrp = stockItem.mrp || 0;

        if (billPrice > 0 && billPrice !== stockItem.price) {
          stockItem.price = billPrice;
          rateOrMrpChanged = true;
        }
        if (billMrp > 0 && billMrp !== stockItem.mrp) {
          stockItem.mrp = billMrp;
          rateOrMrpChanged = true;
        }
        if (stockItem.mrp && stockItem.price && stockItem.mrp > stockItem.price) {
          stockItem.discount = Math.round(((stockItem.mrp - stockItem.price) / stockItem.mrp) * 100);
        }

        if (rateOrMrpChanged) {
          newLogs.push({
            id: Date.now() + Math.floor(Math.random() * 1000000) + stockItem.id + 7,
            productId: stockItem.id,
            productName: stockItem.name,
            sku: stockItem.sku,
            type: 'ADJUSTMENT',
            qty: 0,
            prevStock: stockItem.stock,
            newStock: stockItem.stock,
            date: new Date().toISOString().split('T')[0],
            reference: `Price/MRP updated from Bill ${payload.serial} (Old Rate: ₹${oldPrice} -> ₹${stockItem.price}, Old MRP: ₹${oldMrp} -> ₹${stockItem.mrp})`,
            price: stockItem.price
          });
        }
      }

      // Outgoing sales deduction stock log
      newLogs.push({
        id: Date.now() + Math.floor(Math.random() * 1000000) + stockItem.id + 1,
        productId: stockItem.id,
        productName: stockItem.name,
        sku: stockItem.sku,
        type: 'OUTGOING',
        qty: soldQty,
        prevStock: stockItem.stock,
        newStock: Math.max(0, stockItem.stock - soldQty),
        date: new Date().toISOString().split('T')[0],
        reference: `Sales Bill ${payload.serial}`,
        price: it.purchasePrice || stockItem.purchasePrice || stockItem.price * (costFallbackPct / 100)
      });
      stockItem.stock = Math.max(0, stockItem.stock - soldQty); // keep non-negative
    });

    if (editingEstimateId !== null) {
      const idx = updatedEstimates.findIndex(e => e.id === editingEstimateId);
      if (idx !== -1) {
        updatedEstimates[idx] = payload;
      } else {
        updatedEstimates.push(payload);
      }
    } else {
      // Strictly prevent duplicate EST-XXX serial numbers on new bills
      const cleanRequestedSerial = (payload.serial || '').trim().toUpperCase();
      const serialAlreadyExists = updatedEstimates.some(
        e => (e.serial || '').trim().toUpperCase() === cleanRequestedSerial
      );
      if (!cleanRequestedSerial || serialAlreadyExists) {
        let nextNum = 1;
        const estSerials = updatedEstimates
          .map(e => {
            const match = (e.serial || '').trim().match(/^EST-(\d+)$/i);
            return match ? parseInt(match[1], 10) : 0;
          })
          .filter(n => n > 0);
        if (estSerials.length > 0) {
          nextNum = Math.max(...estSerials) + 1;
        } else {
          nextNum = updatedEstimates.length + 1;
        }
        payload = {
          ...payload,
          serial: `EST-${String(nextNum).padStart(3, '0')}`
        };
      }
      updatedEstimates.push(payload);
    }

    // Update state and localStorage stores
    setDbEstimates(updatedEstimates);
    setDbProducts(updatedProductsList);
    try {
      const productsKey = currentUser ? `off_products_${currentUser}` : 'off_products';
      const estimatesKey = currentUser ? `off_estimates_${currentUser}` : 'off_estimates';
      
      // Perform immediate, blocking synchronous writes to namespaced storage keys before any background async triggers
      if (currentUser) {
        safeStorage.setItem(`user_${currentUser}_estimates`, JSON.stringify(updatedEstimates));
        safeStorage.setItem(`user_${currentUser}_invoices`, JSON.stringify(updatedEstimates));
        safeStorage.setItem(`user_${currentUser}_products`, JSON.stringify(updatedProductsList));
      }
      
      safeStorage.setItem(estimatesKey, JSON.stringify(updatedEstimates));
      safeStorage.setItem('off_estimates', JSON.stringify(updatedEstimates));
      safeStorage.setItem(productsKey, JSON.stringify(updatedProductsList));
      safeStorage.setItem('off_products', JSON.stringify(updatedProductsList));

      // Also update standard Namespaced Keys for perfect consistency
      safeStorage.setItem(getEstimatesKey(currentUser || ''), JSON.stringify(updatedEstimates));
      safeStorage.setItem(getProductsKey(currentUser || ''), JSON.stringify(updatedProductsList));
    } catch (e) {}

    let updatedLogs = dbStockLogs;
    if (newLogs.length > 0) {
      updatedLogs = [...newLogs, ...dbStockLogs];
      setDbStockLogs(updatedLogs);
      try {
        const stockLogsKey = `off_stock_logs_${currentUser}`;
        safeStorage.setItem(stockLogsKey, JSON.stringify(updatedLogs));
        safeStorage.setItem(getStockLogsKey(currentUser || ''), JSON.stringify(updatedLogs));
      } catch (e) {}
    }

    if (currentUser) {
      saveUserIsolatedData(currentUser, {
        clients: dbClients,
        products: updatedProductsList,
        estimates: updatedEstimates,
        stockLogs: updatedLogs,
        businessName,
        lastMutationTime: Date.now()
      });
    }

    registerLocalMutation();

    // Immediately update UI / open Print Dialog BEFORE awaiting network sync so F3 is instant
    setEditingEstimateId(null);
    showToast(`Bill ${payload.serial} saved successfully!`);

    if (openPrint) {
      setAutoTriggerPrintOnOpen(true);
      setActivePrintEstimate(payload);
    } else if (!stayOnNewBill && currentUserRole !== 'clerk') {
      navigateToTab('dashboard');
    }

    // Background / High-Priority Cloud Sync
    if (currentUser && !isForceOfflineActive) {
      const userMatched = dbUsers.find(u => u.phone === currentUser);
      if (userMatched && userMatched.password) {
        setAutoSaveStatus('saving');
        const now = Date.now();
        lastLocalMutationTimeRef.current = now;
        setLastLocalMutationTime(now);
        try {
          safeStorage.setItem(`last_local_mutation_${currentUser}`, now.toString());
          safeStorage.setItem(getMutationKey(currentUser), now.toString());
          safeStorage.setItem(`user_${currentUser}_last_synced_millis`, now.toString());
        } catch (e) {}

        const payloadToSync = {
          password: userMatched.password,
          businessName: businessName,
          clients: dbClients,
          products: updatedProductsList,
          estimates: updatedEstimates,
          last_synced_millis: now
        };

        try {
          console.log("[Auto-Save] Firing high priority blocking POST fetch request...");
          const response = await fetch(`/api/sync/${currentUser}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadToSync)
          });

          if (response.status === 409) {
            console.warn("[Auto-Save] Conflict detected during invoice generation. Merging latest cloud version.");
            const getResponse = await fetch(`/api/sync/${currentUser}?password=${encodeURIComponent(userMatched.password)}`);
            if (getResponse.ok) {
              const syncData = await getResponse.json();
              const clients = Array.isArray(syncData.clients) ? syncData.clients : [];
              const serverProducts = Array.isArray(syncData.products) ? syncData.products : [];
              const serverEsts = Array.isArray(syncData.estimates) ? sanitizeEstimates(syncData.estimates) : [];

              setDbClients(clients);
              safeStorage.setItem(getClientsKey(currentUser), JSON.stringify(clients));
              safeStorage.setItem(`off_clients_${currentUser}`, JSON.stringify(clients));

              // Merge server products with local updated products so newly auto-saved items are never lost
              const mergedProducts = [...serverProducts];
              updatedProductsList.forEach(localP => {
                const existingIdx = mergedProducts.findIndex(p => p.id === localP.id || p.name.trim().toLowerCase() === localP.name.trim().toLowerCase());
                if (existingIdx === -1) {
                  mergedProducts.push(localP);
                } else {
                  mergedProducts[existingIdx] = { ...mergedProducts[existingIdx], ...localP };
                }
              });

              setDbProducts(mergedProducts);
              safeStorage.setItem(getProductsKey(currentUser), JSON.stringify(mergedProducts));
              safeStorage.setItem(`off_products_${currentUser}`, JSON.stringify(mergedProducts));
              safeStorage.setItem('off_products', JSON.stringify(mergedProducts));

              // Avoid overwriting newly generated estimate if it doesn't exist on server yet, merge them
              const mergedEstimates = [...serverEsts];
              updatedEstimates.forEach(localEst => {
                if (!mergedEstimates.some(e => e.id === localEst.id)) {
                  mergedEstimates.push(localEst);
                }
              });

              setDbEstimates(mergedEstimates);
              safeStorage.setItem(getEstimatesKey(currentUser), JSON.stringify(mergedEstimates));
              safeStorage.setItem(`off_estimates_${currentUser}`, JSON.stringify(mergedEstimates));

              const serverEpoch = syncData.last_synced_millis || (syncData.updatedAt ? new Date(syncData.updatedAt).getTime() : Date.now());
              safeStorage.setItem(getMutationKey(currentUser), serverEpoch.toString());
              safeStorage.setItem(`user_${currentUser}_last_synced_millis`, serverEpoch.toString());
              lastLocalMutationTimeRef.current = serverEpoch;
              setLastLocalMutationTime(serverEpoch);

              // Update isolated key as well
              saveUserIsolatedData(currentUser, {
                clients,
                products: mergedProducts,
                estimates: mergedEstimates,
                stockLogs: updatedLogs,
                businessName: syncData.businessName || businessName,
                lastMutationTime: serverEpoch
              });

              // Push the merged payload to ensure server matches local merge
              const finalMergedPayload = {
                password: userMatched.password,
                businessName: businessName,
                clients,
                products: mergedProducts,
                estimates: mergedEstimates,
                last_synced_millis: serverEpoch + 1000
              };
              await fetch(`/api/sync/${currentUser}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalMergedPayload)
              }).catch(() => {});

              setRenderKey(prev => prev + 1);
              setSyncConflictDetected(false);
              setAutoSaveStatus('synced');
              removeFromOfflineSyncQueue(currentUser);
            }
          } else if (response.ok) {
            const resData = await response.json();
            setSyncConflictDetected(false);
            setAutoSaveStatus('synced');
            removeFromOfflineSyncQueue(currentUser);
            if (resData.updatedAt) {
              setLastSyncedAt(resData.updatedAt);
              const syncEpoch = resData.last_synced_millis || new Date(resData.updatedAt).getTime();
              try {
                safeStorage.setItem(`last_local_mutation_${currentUser}`, syncEpoch.toString());
                safeStorage.setItem(getMutationKey(currentUser), syncEpoch.toString());
                safeStorage.setItem(`user_${currentUser}_last_synced_millis`, syncEpoch.toString());
                lastLocalMutationTimeRef.current = syncEpoch;
                setLastLocalMutationTime(syncEpoch);
              } catch (e) {}
            }
          } else {
            // Standard fallback trigger on server errors
            await triggerAutomaticCloudSave(dbClients, updatedProductsList, updatedEstimates, updatedLogs);
          }
        } catch (err) {
          console.error("[Auto-Save] Synchronous push error:", err);
          await triggerAutomaticCloudSave(dbClients, updatedProductsList, updatedEstimates, updatedLogs);
        }
      } else {
        await triggerAutomaticCloudSave(dbClients, updatedProductsList, updatedEstimates, updatedLogs);
      }
    } else {
      // Offline mode or no currentUser
      await triggerAutomaticCloudSave(dbClients, updatedProductsList, updatedEstimates, updatedLogs);
    }
  };

  const handleRestoreOriginalData = async () => {
    if (!currentUser) return;
    
    const confirmRestore = await requestConfirm({
      title: 'Restore Original Records',
      message: "Are you sure you want to restore your original records? This will search your browser's backup storage and overwrite current demo bills and clients.",
      confirmText: 'Restore Data',
      cancelText: 'Cancel',
      variant: 'warning',
    });
    if (!confirmRestore) return;

    try {
      const oldClientsStr = safeStorage.getItem(`off_clients_${currentUser}`);
      const oldProductsStr = safeStorage.getItem(`off_products_${currentUser}`);
      const oldEstimatesStr = safeStorage.getItem(`off_estimates_${currentUser}`);
      const oldStockLogsStr = safeStorage.getItem(`off_stock_logs_${currentUser}`);

      let restoredClients = [];
      let restoredProducts = [];
      let restoredEstimates = [];
      let restoredStockLogs = [];
      let hasAnyOldData = false;

      if (oldClientsStr) {
        try {
          const parsed = JSON.parse(oldClientsStr);
          if (Array.isArray(parsed) && parsed.length > 0 && !isMockDataset(parsed, [])) {
            restoredClients = parsed;
            hasAnyOldData = true;
          }
        } catch (e) {}
      }
      if (oldProductsStr) {
        try {
          const parsed = JSON.parse(oldProductsStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            restoredProducts = parsed;
            hasAnyOldData = true;
          }
        } catch (e) {}
      }
      if (oldEstimatesStr) {
        try {
          const parsed = JSON.parse(oldEstimatesStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            restoredEstimates = sanitizeEstimates(parsed);
            hasAnyOldData = true;
          }
        } catch (e) {}
      }
      if (oldStockLogsStr) {
        try {
          const parsed = JSON.parse(oldStockLogsStr);
          if (Array.isArray(parsed)) {
            restoredStockLogs = parsed;
          }
        } catch (e) {}
      }

      if (hasAnyOldData) {
        // Set state
        setDbClients(restoredClients);
        setDbProducts(restoredProducts);
        setDbEstimates(restoredEstimates);
        setDbStockLogs(restoredStockLogs);

        // Save to active keys
        safeStorage.setItem(getClientsKey(currentUser), JSON.stringify(restoredClients));
        safeStorage.setItem(getProductsKey(currentUser), JSON.stringify(restoredProducts));
        safeStorage.setItem(getEstimatesKey(currentUser), JSON.stringify(restoredEstimates));
        safeStorage.setItem(getStockLogsKey(currentUser), JSON.stringify(restoredStockLogs));

        // Update sync timestamp
        const nowEpoch = Date.now();
        safeStorage.setItem(getMutationKey(currentUser), nowEpoch.toString());
        safeStorage.setItem(`user_${currentUser}_last_synced_millis`, nowEpoch.toString());
        lastLocalMutationTimeRef.current = nowEpoch;
        setLastLocalMutationTime(nowEpoch);

        // Immediately push to cloud server to persist restored data
        showToast("🔄 Restored locally! Uploading to server...");
        
        const payload = {
          password: dbUsers.find(u => u.phone === currentUser)?.password || "494228",
          businessName: businessName,
          clients: restoredClients,
          products: restoredProducts,
          estimates: restoredEstimates,
          last_synced_millis: nowEpoch
        };

        const response = await fetch(`/api/sync/${currentUser}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          showToast("✓ Original data successfully restored and synced on cloud!");
        } else {
          showToast("✓ Restored locally, but server sync failed. It will auto-sync later.");
        }
      } else {
        alert("No previous data was found in your browser's local backup keys. We will wipe the demo data and let you start fresh.");
        await handleWipeDemoData();
      }
    } catch (err) {
      console.error(err);
      showToast("Error occurred during restoration.");
    }
  };

  const handleWipeDemoData = async () => {
    if (!currentUser) return;
    
    const confirmWipe = await requestConfirm({
      title: 'Wipe Demo Data',
      message: 'Are you sure you want to completely delete all demo bills, stock logs, products, and customers? This cannot be undone.',
      confirmText: 'Wipe All Data',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmWipe) return;

    try {
      setDbClients([]);
      setDbProducts([]);
      setDbEstimates([]);
      setDbStockLogs([]);

      safeStorage.setItem(getClientsKey(currentUser), JSON.stringify([]));
      safeStorage.setItem(getProductsKey(currentUser), JSON.stringify([]));
      safeStorage.setItem(getEstimatesKey(currentUser), JSON.stringify([]));
      safeStorage.setItem(getStockLogsKey(currentUser), JSON.stringify([]));

      const nowEpoch = Date.now();
      safeStorage.setItem(getMutationKey(currentUser), nowEpoch.toString());
      safeStorage.setItem(`user_${currentUser}_last_synced_millis`, nowEpoch.toString());
      lastLocalMutationTimeRef.current = nowEpoch;
      setLastLocalMutationTime(nowEpoch);

      showToast("🧹 Wiping demo data from server...");

      const payload = {
        password: dbUsers.find(u => u.phone === currentUser)?.password || "494228",
        businessName: businessName,
        clients: [],
        products: [],
        estimates: [],
        last_synced_millis: nowEpoch
      };

      const response = await fetch(`/api/sync/${currentUser}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        showToast("✓ Demo data successfully removed from your account!");
      } else {
        showToast("✓ Wiped locally. It will sync to the cloud shortly.");
      }
    } catch (err) {
      console.error(err);
      showToast("Error occurred while wiping demo data.");
    }
  };

  const handleDeleteEstimate = async (id: number) => {
    const matchedEst = dbEstimates.find(e => e.id === id);
    if (!matchedEst) return;

    const confirmation = await requestConfirm({
      title: `Delete Bill ${matchedEst.serial}`,
      message: `Are you sure you want to permanently delete bill ${matchedEst.serial} (${matchedEst.clientName || 'Cash Customer'} - ₹${matchedEst.grandTotal})?\n\nStock quantities will be restored and the bill will be permanently removed from Local DB, Server, and Cloud Sync.`,
      confirmText: 'Delete Permanently',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmation) return;

    // Record deleted bill ID in persistent tombstone list so cloud/local sync never resurrects it on refresh
    addDeletedEstimateId(currentUser, id);

    // Revert product quantities back to stock ledger balances
    const updatedProductsList = [...dbProducts];
    const newLogs: StockLog[] = [];

    matchedEst.items.forEach(it => {
      let stockItem = updatedProductsList.find(p => p.name.trim().toLowerCase() === it.name.trim().toLowerCase());
      if (stockItem) {
        newLogs.push({
          id: Date.now() + Math.floor(Math.random() * 1000000) + stockItem.id,
          productId: stockItem.id,
          productName: stockItem.name,
          sku: stockItem.sku,
          type: 'RETURN',
          qty: it.qty,
          prevStock: stockItem.stock,
          newStock: stockItem.stock + it.qty,
          date: new Date().toISOString().split('T')[0],
          reference: `Void / Delete Bill ${matchedEst.serial}`,
          price: it.purchasePrice || stockItem.purchasePrice || stockItem.price * (costFallbackPct / 100)
        });
        stockItem.stock += it.qty;
      }
    });

    const updatedEstimates = dbEstimates.filter(e => e.id !== id);
    setDbEstimates(updatedEstimates);
    setDbProducts(updatedProductsList);

    let updatedLogs = dbStockLogs;
    if (newLogs.length > 0) {
      updatedLogs = [...newLogs, ...dbStockLogs];
      setDbStockLogs(updatedLogs);
    }

    // Synchronously purge deleted bill across ALL localStorage keys and IndexedDB
    try {
      const productsKey = currentUser ? `off_products_${currentUser}` : 'off_products';
      const estimatesKey = currentUser ? `off_estimates_${currentUser}` : 'off_estimates';
      const stockLogsKey = `off_stock_logs_${currentUser}`;

      if (currentUser) {
        safeStorage.setItem(getEstimatesKey(currentUser), JSON.stringify(updatedEstimates));
        safeStorage.setItem(`user_${currentUser}_estimates`, JSON.stringify(updatedEstimates));
        safeStorage.setItem(`user_${currentUser}_invoices`, JSON.stringify(updatedEstimates));
        safeStorage.setItem(getProductsKey(currentUser), JSON.stringify(updatedProductsList));
        safeStorage.setItem(`user_${currentUser}_products`, JSON.stringify(updatedProductsList));
        safeStorage.setItem(getStockLogsKey(currentUser), JSON.stringify(updatedLogs));
      }

      safeStorage.setItem(estimatesKey, JSON.stringify(updatedEstimates));
      safeStorage.setItem('off_estimates', JSON.stringify(updatedEstimates));
      safeStorage.setItem(productsKey, JSON.stringify(updatedProductsList));
      safeStorage.setItem('off_products', JSON.stringify(updatedProductsList));
      safeStorage.setItem(stockLogsKey, JSON.stringify(updatedLogs));
      safeStorage.setItem('off_stock_logs', JSON.stringify(updatedLogs));
    } catch (e) {}

    // Remove from Dexie IndexedDB & update isolated user store
    try {
      db.estimates.delete(id).catch(() => {});
      if (currentUser) {
        saveUserIsolatedData(currentUser, {
          clients: dbClients,
          products: updatedProductsList,
          estimates: updatedEstimates,
          stockLogs: updatedLogs,
          businessName,
          lastMutationTime: Date.now()
        });
      }
    } catch (e) {}

    registerLocalMutation();

    // Permanently overwrite Server & Firestore Cloud Sync with force: true so even deleting the last bill succeeds
    await forceCloudSaveSynchronous(dbClients, updatedProductsList, updatedEstimates, updatedLogs, true);

    showToast(`Bill ${matchedEst.serial} permanently deleted & stock restored!`);
  };

  // Systems parameters profiles
  const triggerOpenProfileModal = () => {
    const userMatched = dbUsers.find(u => u.phone === currentUser);
    setProfileBusinessName(userMatched?.businessName || businessName);
    setProfileNewPassword('');
    setProfileClerkPassword(userMatched?.clerkPassword || 'clerk123');
    try {
      setProfileCustomGeminiApiKey(localStorage.getItem("custom_gemini_api_key") || "");
    } catch {
      setProfileCustomGeminiApiKey("");
    }
    setShowProfileModal(true);
  };

  const handleSaveProfileChanges = () => {
    const updatedUsers = dbUsers.map(u => {
      if (u.phone === currentUser) {
        const payload: User = {
          ...u,
          businessName: profileBusinessName.trim() || 'My Offline Counter',
          clerkPassword: profileClerkPassword.trim() || 'clerk123'
        };
        if (profileNewPassword.trim().length >= 4) {
          payload.password = profileNewPassword.trim();
        }
        return payload;
      }
      return u;
    });

    try {
      localStorage.setItem("custom_gemini_api_key", profileCustomGeminiApiKey.trim());
    } catch {}

    handleUpdateUsers(updatedUsers);
    setBusinessName(profileBusinessName.trim() || 'My Offline Counter');
    registerLocalMutation();
    setShowProfileModal(false);
    showToast("Profile & business settings updated!");
  };

  // Backup & Import Restoration commands
  const handleImportBackupRestore = async (imported: {
    clients: Client[];
    products: Product[];
    estimates: Estimate[];
    users: User[];
    stockLogs?: StockLog[];
    mode?: 'replace' | 'merge';
    last_synced_millis?: number;
  }) => {
    const isReplace = imported.mode === 'replace' || !imported.mode;
    const now = Date.now();
    lastLocalMutationTimeRef.current = now;
    setLastLocalMutationTime(now);

    let finalClients: Client[] = [];
    let finalProducts: Product[] = [];
    let finalEstimates: Estimate[] = [];
    let finalStockLogs: StockLog[] = [];
    let finalUsers: User[] = [...dbUsers];

    if (isReplace) {
      finalClients = sanitizeClients(imported.clients || []);
      finalProducts = sanitizeProducts(imported.products || []);
      finalEstimates = sanitizeEstimates(imported.estimates || []);
      finalStockLogs = Array.isArray(imported.stockLogs) ? imported.stockLogs : [];
      if (Array.isArray(imported.users) && imported.users.length > 0) {
        finalUsers = imported.users;
      }
    } else {
      // Merge mode
      finalClients = [...dbClients];
      finalProducts = [...dbProducts];
      finalEstimates = [...dbEstimates];
      finalStockLogs = [...dbStockLogs];

      if (Array.isArray(imported.clients)) {
        const sanitizedNewClients = sanitizeClients(imported.clients);
        sanitizedNewClients.forEach(imp => {
          const matchedIdx = finalClients.findIndex(c => 
            c.name.trim().toLowerCase() === imp.name.trim().toLowerCase() &&
            c.phone.trim() === imp.phone.trim()
          );
          if (matchedIdx >= 0) {
            const existing = finalClients[matchedIdx];
            finalClients[matchedIdx] = {
              ...existing,
              address: imp.address || existing.address,
              gstin: imp.gstin || existing.gstin,
              stateCode: imp.stateCode || existing.stateCode
            };
          } else {
            const idExists = finalClients.some(c => c.id === imp.id);
            finalClients.push({
              ...imp,
              id: idExists ? Date.now() + Math.floor(Math.random() * 100000) : imp.id
            });
          }
        });
      }

      if (Array.isArray(imported.products)) {
        const sanitizedNewProducts = sanitizeProducts(imported.products);
        sanitizedNewProducts.forEach(imp => {
          const matchedIdx = finalProducts.findIndex(p => 
            p.name.trim().toLowerCase() === imp.name.trim().toLowerCase() ||
            (p.sku && imp.sku && p.sku.trim().toLowerCase() === imp.sku.trim().toLowerCase())
          );
          if (matchedIdx >= 0) {
            const existing = finalProducts[matchedIdx];
            finalProducts[matchedIdx] = {
              ...existing,
              stock: existing.stock + (Number(imp.stock) || 0),
              price: imp.price > 0 ? imp.price : existing.price,
              mrp: imp.mrp > 0 ? imp.mrp : existing.mrp,
              purchasePrice: imp.purchasePrice && imp.purchasePrice > 0 ? imp.purchasePrice : existing.purchasePrice,
              discount: imp.discount !== undefined ? imp.discount : existing.discount
            };
          } else {
            const idExists = finalProducts.some(p => p.id === imp.id);
            finalProducts.push({
              ...imp,
              id: idExists ? Date.now() + Math.floor(Math.random() * 100000) : imp.id
            });
          }
        });
      }

      if (Array.isArray(imported.estimates)) {
        const sanitizedNewEstimates = sanitizeEstimates(imported.estimates);
        sanitizedNewEstimates.forEach(imp => {
          const isDuplicate = finalEstimates.some(e => 
            e.serial.trim().toLowerCase() === imp.serial.trim().toLowerCase()
          );
          if (!isDuplicate) {
            const idExists = finalEstimates.some(e => e.id === imp.id);
            finalEstimates.push({
              ...imp,
              id: idExists ? Date.now() + Math.floor(Math.random() * 100000) : imp.id
            });
          }
        });
      }

      if (Array.isArray(imported.stockLogs)) {
        finalStockLogs = [...finalStockLogs, ...imported.stockLogs];
      }

      if (Array.isArray(imported.users) && imported.users.length > 0) {
        imported.users.forEach(imp => {
          if (!finalUsers.some(u => u.phone === imp.phone)) {
            finalUsers.push(imp);
          }
        });
      }
    }

    finalClients = sanitizeClients(finalClients);
    finalProducts = sanitizeProducts(finalProducts);
    finalEstimates = sanitizeEstimates(finalEstimates);

    // Update React states immediately
    setDbClients(finalClients);
    setDbProducts(finalProducts);
    setDbEstimates(finalEstimates);
    setDbStockLogs(finalStockLogs);
    setDbUsers(finalUsers);

    // Synchronously write to all isolated and legacy safeStorage keys
    const tsStr = now.toString();
    if (currentUser) {
      safeStorage.setItem(getClientsKey(currentUser), JSON.stringify(finalClients));
      safeStorage.setItem(getProductsKey(currentUser), JSON.stringify(finalProducts));
      safeStorage.setItem(getEstimatesKey(currentUser), JSON.stringify(finalEstimates));
      safeStorage.setItem(getStockLogsKey(currentUser), JSON.stringify(finalStockLogs));
      safeStorage.setItem(`off_clients_${currentUser}`, JSON.stringify(finalClients));
      safeStorage.setItem(`off_products_${currentUser}`, JSON.stringify(finalProducts));
      safeStorage.setItem(`off_estimates_${currentUser}`, JSON.stringify(finalEstimates));
      safeStorage.setItem(`off_stock_logs_${currentUser}`, JSON.stringify(finalStockLogs));
      safeStorage.setItem(`last_local_mutation_${currentUser}`, tsStr);
      safeStorage.setItem(getMutationKey(currentUser), tsStr);
      safeStorage.setItem(`user_${currentUser}_last_synced_millis`, tsStr);

      // Async Dexie persistence
      saveUserIsolatedData(currentUser, {
        clients: finalClients,
        products: finalProducts,
        estimates: finalEstimates,
        stockLogs: finalStockLogs,
        auditLogs: [],
        costFallbackPct,
        businessName
      });
    }

    // Global backup keys
    safeStorage.setItem('off_clients', JSON.stringify(finalClients));
    safeStorage.setItem('off_products', JSON.stringify(finalProducts));
    safeStorage.setItem('off_estimates', JSON.stringify(finalEstimates));
    safeStorage.setItem('off_stock_logs', JSON.stringify(finalStockLogs));
    safeStorage.setItem('off_users', JSON.stringify(finalUsers));

    // Instant UI refresh
    setRenderKey(prev => prev + 1);

    const actionText = isReplace ? "Restored & Replaced" : "Merged";
    showToast(`✓ Backup ${actionText}: ${finalEstimates.length} invoices, ${finalProducts.length} items, ${finalClients.length} parties`);

    // Force upload to cloud with force: true so server and firestore accept restored state
    if (currentUser) {
      await forceCloudSaveSynchronous(finalClients, finalProducts, finalEstimates, finalStockLogs, true);
    }
  };

  const handleWipeDatabaseReset = async () => {
    const firstConfirm = await requestConfirm({
      title: '⚠️ Wipe Entire Local Database',
      message: 'WARNING: You are about to wipe your entire local database (all bills, inventory items, and customers). This action is irreversible.\n\nAre you sure you want to proceed?',
      confirmText: 'Yes, Wipe Database',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!firstConfirm) return;

    lastLocalMutationTimeRef.current = Date.now();
    const prefix = currentUser ? `_${currentUser}` : '';
    try {
      safeStorage.removeItem(`off_clients${prefix}`);
      safeStorage.removeItem(`off_products${prefix}`);
      safeStorage.removeItem(`off_estimates${prefix}`);
    } catch (e) {}
    // preserve current session of user to keep from force logouts, but clean data assets
    setDbClients([]);
    setDbProducts([]);
    setDbEstimates([]);
    showToast("Sandbox database cleared successfully!");
    setCurrentTab('dashboard');
  };

  // 2. Render Check Authentication session
  if (!currentUser) {
    return (
      <AuthLayout
        dbUsers={dbUsers}
        onUpdateUsers={handleUpdateUsers}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  if (isSyncingLogin) {
    return (
      <div id="blocking-sync-screen" className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-4 font-sans select-none">
        <div className="w-16 h-16 border-4 border-t-blue-500 border-blue-950 rounded-full animate-spin mb-6"></div>
        <h2 className="text-xl font-bold tracking-tight mb-2">
          {syncMessage.includes("Downloading") ? "Downloading Data from Cloud..." : "Syncing to Cloud..."}
        </h2>
        <p className="text-sm text-slate-400 max-w-xs text-center font-medium">
          {syncMessage}
        </p>
      </div>
    );
  }

  if (isMobileMode) {
    // If the active tab is not supported on mobile, default to Fast Bill
    if (currentTab === 'backup') {
      navigateToTab('create_estimate', { replace: true });
    }

    return (
      <div key={renderKey} className="flex flex-col min-h-screen bg-slate-100 select-none no-print pb-20">
        {/* Toast notifications */}
        {toastMessage && (
          <div className="fixed top-4 left-4 right-4 bg-slate-900 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-xl flex items-center space-x-2.5 z-50 animate-bounce">
            <CheckCircle className="w-4 h-4 text-emerald-450" />
            <span className="flex-1">{toastMessage}</span>
          </div>
        )}

        {/* Mobile Top Header */}
        <header className="sticky top-0 bg-slate-950 text-white p-3.5 shadow-md flex items-center justify-between z-40 select-none border-b border-slate-900">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-lg shadow-md shadow-blue-500/20">
              📱
            </div>
            <div className="max-w-[130px] truncate">
              <h1 className="font-black text-xs tracking-tight uppercase leading-none">{businessName}</h1>
              <span className="text-[8px] font-bold text-blue-400 mt-1 block uppercase tracking-widest leading-none">
                {currentUserRole === 'clerk' ? 'Staff Clerk' : 'Shop Owner'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            {/* Quick Print Customizer trigger */}
            <button
              onClick={() => navigateToTab('print_customizer')}
              className={`p-2 rounded-xl cursor-pointer text-xs border transition-all ${
                currentTab === 'print_customizer'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-300'
              }`}
              title="Print Setup & Customizer"
            >
              🖨️
            </button>

            {/* Quick Settings trigger */}
            <button
              onClick={() => navigateToTab('settings')}
              className={`p-2 rounded-xl cursor-pointer text-xs border transition-all ${
                currentTab === 'settings'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-300'
              }`}
              title="Settings & Profile"
            >
              ⚙️
            </button>

            {/* Quick Lock Counter */}
            <button
              onClick={() => setIsCounterLocked(true)}
              className="p-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-amber-400 rounded-xl cursor-pointer text-xs"
              title="Lock Counter Screen"
            >
              🔒
            </button>

            {/* Dark Mode toggle */}
            <button
              type="button"
              onClick={() => handleToggleDarkMode(!appSettings.darkMode)}
              className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-xl cursor-pointer text-xs flex items-center justify-center transition-colors"
              title={appSettings.darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {appSettings.darkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-300" />
              )}
            </button>

            {/* Quick Backup trigger */}
            <button
              onClick={() => navigateToTab('backup')}
              className={`p-2 rounded-xl cursor-pointer text-xs border transition-all ${
                currentTab === 'backup'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-300'
              }`}
              title="Data Backup"
            >
              💾
            </button>

            {/* Quick Sync trigger */}
            <button
              onClick={handleSyncDataWithServer}
              className="p-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 rounded-xl cursor-pointer text-xs animate-pulse"
              title="Sync Data with Server"
            >
              🔄
            </button>

            {/* Force Offline Indicator */}
            <button
              onClick={() => handleToggleForceOffline(!isForceOfflineActive)}
              className={`px-2.5 py-1.5 rounded-xl font-bold text-[8px] uppercase tracking-wider border cursor-pointer ${
                isForceOfflineActive
                  ? 'bg-amber-950/40 border-amber-900/60 text-amber-400'
                  : 'bg-emerald-950/40 border-emerald-900/60 text-emerald-450'
              }`}
            >
              {isForceOfflineActive ? 'Offline' : 'Sync Live'}
            </button>

            {/* Switch to PC View Override */}
            <button
              onClick={() => {
                setIsMobileMode(false);
                localStorage.setItem('layout_preference', 'pc');
                showToast("Switched to Advanced PC Console! (💻)");
              }}
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[8px] font-black uppercase tracking-wider cursor-pointer font-sans"
              title="Switch to PC View"
            >
              💻 PC VIEW
            </button>
          </div>
        </header>

        {/* Scrollable Container Content Body */}
        <main className="flex-1 p-3.5 overflow-y-auto bg-slate-50">
          
          {/* Sync Conflict Alert & Resolution Bar */}
          {syncConflictDetected && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex flex-col gap-3 shadow-sm animate-fade-in no-print">
              <div className="flex items-start gap-2.5">
                <span className="text-base mt-0.5">⚠️</span>
                <div>
                  <h4 className="font-extrabold text-amber-950 text-[12px] leading-tight">
                    Sync Conflict: Server has newer data
                  </h4>
                  <p className="text-[10px] text-amber-850 leading-normal mt-1 font-semibold">
                    Newer invoice or inventory data was detected on the cloud server. Please choose an option below to synchronize:
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <button
                  onClick={() => handleResolveConflict('server')}
                  className="w-full bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-extrabold px-3 py-2 rounded-xl text-[10px] shadow-xs transition-all cursor-pointer text-center"
                >
                  📥 Download Server Data
                </button>
                <button
                  onClick={() => handleResolveConflict('local')}
                  className="w-full bg-white border border-amber-300 hover:bg-amber-50 active:scale-95 text-amber-850 font-bold px-3 py-2 rounded-xl text-[10px] transition-all cursor-pointer text-center"
                >
                  📤 Force Upload Local Data
                </button>
                <button
                  onClick={() => setSyncConflictDetected(false)}
                  className="w-full text-center text-[10px] text-amber-600 font-bold hover:text-amber-800 py-1"
                >
                  ✕ Dismiss
                </button>
              </div>
            </div>
          )}
          
          {/* TAB 0: Mobile Dashboard Reports */}
          {currentTab === 'dashboard' && (
            <Dashboard
              estimates={dbEstimates}
              products={dbProducts}
              clients={dbClients}
              onEditEstimate={(id) => {
                setEditingEstimateId(id);
                navigateToTab('create_estimate');
              }}
              onPrintEstimate={(id) => {
                const matched = dbEstimates.find(e => e.id === id);
                if (matched) openPrintInvoice(matched);
              }}
              onDeleteEstimate={handleDeleteEstimate}
              onCreateNewClick={() => {
                setEditingEstimateId(null);
                navigateToTab('create_estimate');
              }}
              onAddNewProduct={() => navigateToTab('products')}
              onAddNewClient={() => navigateToTab('clients')}
              onViewLedgers={() => navigateToTab('statements')}
              onOpenPrintSetup={() => navigateToTab('print_customizer')}
              onNavigateToTab={navigateToTab}
              costFallbackPct={costFallbackPct}
              isMobile={true}
              businessName={businessName}
              userRole={currentUserRole}
            />
          )}

          {/* TAB 1: Fast Bill / Create Estimate */}
          {currentTab === 'create_estimate' && (
            <CreateEstimate
              clients={dbClients}
              products={dbProducts}
              estimates={dbEstimates}
              editingEstimateId={editingEstimateId}
              onSaveEstimate={handleSaveInvoice}
              onQuickPrintLatest={() => {
                if (dbEstimates.length > 0) {
                  openPrintInvoice(dbEstimates[dbEstimates.length - 1], true);
                }
              }}
              onCancel={() => {
                setEditingEstimateId(null);
                goBack();
              }}
              onAddNewClient={handleAddNewClient}
              onAddNewProduct={handleAddNewProduct}
              userRole={currentUserRole}
              isMobile={true}
            />
          )}

          {/* TAB 2: Scan Camera */}
          {currentTab === 'scan_camera' && (
            <div className="space-y-5 animate-fade-in">
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm text-center">
                <span className="text-4xl block mb-2">📸</span>
                <h2 className="font-black text-slate-800 text-sm">AI Batch Bill Scanner</h2>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Take a photo of any wholesale paper invoice or supplier bill to auto-extract items and stock details.
                </p>

                {/* Laser scan line overlay box */}
                <div 
                  onClick={() => document.getElementById('mobile-camera-input')?.click()}
                  className="relative w-48 h-48 mx-auto my-6 border-4 border-dashed border-slate-200 rounded-2xl overflow-hidden flex items-center justify-center bg-slate-50 hover:bg-slate-100 cursor-pointer group transition-all"
                >
                  {mobileScanStatus === 'scanning' ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white p-3">
                      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                      <span className="text-[10px] uppercase font-black tracking-widest text-blue-400 animate-pulse">Scanning...</span>
                      <span className="text-[9px] text-slate-300 font-bold mt-1 text-center font-mono">Gemini AI analyzing receipts...</span>
                      <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-blue-400 to-cyan-400 animate-bounce top-1/2 shadow-md"></div>
                    </div>
                  ) : mobileScanStatus === 'success' ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-50/95 p-3">
                      <span className="text-3xl mb-1">🎉</span>
                      <span className="text-xs font-black text-emerald-800">Success!</span>
                      <span className="text-[10px] font-bold text-emerald-600 font-mono mt-1 text-center">{mobileScanResultItems.length} Products Found</span>
                    </div>
                  ) : (
                    <div className="text-center p-4">
                      <span className="text-xs font-black text-blue-600 block group-hover:scale-105 transition-transform">📸 Launch Camera</span>
                      <span className="text-[9px] text-slate-400 block mt-1 font-semibold">or select from gallery</span>
                    </div>
                  )}
                </div>

                <input
                  type="file"
                  id="mobile-camera-input"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setMobileScanStatus('scanning');
                    try {
                      const base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve((reader.result as string).split(',')[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                      });
                      
                      const res = await handleScanBillImage(base64);
                      if (res && res.length > 0) {
                        setMobileScanResultItems(res);
                        setMobileScanStatus('success');
                        showToast(`Extracted ${res.length} items from receipt!`);
                      } else {
                        setMobileScanStatus('failed');
                        showToast("OCR Error: Could not extract structured items. Try again!");
                      }
                    } catch (err) {
                      setMobileScanStatus('failed');
                      showToast("Failed to process scan.");
                    }
                  }}
                />

                {mobileScanStatus === 'success' && mobileScanResultItems.length > 0 && (
                  <div className="space-y-3 text-left border-t border-slate-100 pt-4 mt-2">
                    <h3 className="font-extrabold text-slate-700 text-xs uppercase tracking-wider">Preview Extracted Stock</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {mobileScanResultItems.map((item, idx) => (
                        <div key={idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="font-extrabold text-slate-800 text-xs block">{item.name}</span>
                            <span className="text-[9px] text-slate-400 font-bold font-mono">SKU: {item.sku || 'N/A'}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-slate-850 text-xs block font-mono">₹{item.price}</span>
                            <span className="text-[9px] text-slate-400 font-extrabold font-mono block">Stock: +{item.stock}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button
                        onClick={() => {
                          setMobileScanStatus('idle');
                          setMobileScanResultItems([]);
                        }}
                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 rounded-xl font-bold text-xs cursor-pointer transition-colors text-center"
                      >
                        Reset / Re-scan 🔄
                      </button>
                      <button
                        onClick={() => {
                          handleBatchAddProducts(mobileScanResultItems);
                          showToast(`Successfully added ${mobileScanResultItems.length} products to inventory!`);
                          setMobileScanStatus('idle');
                          setMobileScanResultItems([]);
                          navigateToTab('products');
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold text-xs cursor-pointer transition-colors text-center shadow-md shadow-blue-500/15"
                      >
                        📥 Accept & Add Stock
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Quick Products & Inventory */}
          {currentTab === 'products' && (
            <Inventory
              products={dbProducts}
              onAddProduct={handleAddNewProduct}
              onEditProduct={handleEditProduct}
              onDeleteProduct={handleDeleteProduct}
              onBulkStockAdd={handleBulkStockAdd}
              onBulkRegProducts={handleBulkRegProducts}
              onScanBillImage={async (base64) => { await handleScanBillImage(base64); }}
              onBatchAddProducts={handleBatchAddProducts}
              onGlobalPriceMarkup={handleGlobalPriceMarkup}
              isScanning={isScanning}
              stockLogs={dbStockLogs}
              costFallbackPct={costFallbackPct}
              onUpdateCostFallbackPct={handleUpdateCostFallbackPct}
              userRole={currentUserRole}
            />
          )}

          {/* TAB 3.5: Customers Directory */}
          {currentTab === 'clients' && (
            <Customers
              clients={dbClients}
              estimates={dbEstimates}
              onAddClient={handleAddNewClient}
              onEditClient={handleEditClient}
              onDeleteClient={handleDeleteClient}
              onEditEstimate={(id) => {
                setEditingEstimateId(id);
                navigateToTab('create_estimate');
              }}
              onPrintEstimate={(id) => {
                const matched = dbEstimates.find(e => e.id === id);
                if (matched) openPrintInvoice(matched);
              }}
              onDeleteEstimate={handleDeleteEstimate}
              userRole={currentUserRole}
            />
          )}

          {/* TAB 4: Customers Ledger Statements */}
          {currentTab === 'statements' && (
            <div className="space-y-4 animate-fade-in pb-16">
              <Statements
                clients={dbClients}
                estimates={dbEstimates}
                businessName={businessName}
                userRole={currentUserRole}
                initialClientId={selectedStatementClientId}
                onUpdateClientPayments={handleUpdateClientPayments}
                onPrintEstimate={(id) => {
                  const est = dbEstimates.find(e => e.id === id);
                  if (est) openPrintInvoice(est);
                }}
                onEditEstimate={(id) => {
                  setEditingEstimateId(id);
                  navigateToTab('create_estimate');
                }}
              />
            </div>
          )}

          {/* TAB 5: Data Backup */}
          {currentTab === 'backup' && (
            <div className="space-y-4 animate-fade-in pb-16">
              <Backup
                clients={dbClients}
                products={dbProducts}
                estimates={dbEstimates}
                users={dbUsers}
                currentUser={currentUser}
                onImportBackup={handleImportBackupRestore}
                onResetDatabase={handleWipeDatabaseReset}
                onSyncWithCloud={handleSyncDataWithServer}
                onForceUpload={() => handleResolveConflict('local')}
                onForceDownload={() => handleResolveConflict('server')}
                onOpenPrintCustomizer={() => navigateToTab('print_customizer')}
              />
            </div>
          )}

          {/* TAB 6: Print Setup & Preview Customizer */}
          {currentTab === 'print_customizer' && (
            <div className="space-y-4 animate-fade-in pb-16">
              <PrintCustomizer
                businessName={businessName}
                estimates={dbEstimates}
                currentUser={currentUser}
                onNavigateToBilling={() => {
                  setEditingEstimateId(null);
                  navigateToTab('create_estimate');
                }}
              />
            </div>
          )}

          {/* TAB 7: Unified Settings */}
          {currentTab === 'settings' && (
            <div className="space-y-4 animate-fade-in pb-16">
              <Settings
                businessName={businessName}
                currentUser={currentUser}
                estimates={dbEstimates}
                onUpdateBusinessProfile={handleUpdateBusinessProfile}
                onLockCounterNow={() => setIsCounterLocked(true)}
                onShowToast={showToast}
                onSyncWithCloud={handleSyncDataWithServer}
              />
            </div>
          )}

        </main>

        {/* Dedicated sticky bottom navigation rail with large, touch-friendly targets */}
        <nav className="fixed bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur-md border-t border-slate-900 px-1 py-2 flex justify-around items-center z-45 select-none shadow-[0_-8px_32px_rgba(0,0,0,0.3)]">
          <button
            onClick={() => {
              setEditingEstimateId(null);
              navigateToTab('dashboard');
            }}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
              currentTab === 'dashboard' ? 'text-blue-400 font-black scale-105' : 'text-slate-400'
            }`}
          >
            <span className="text-base mb-0.5">📊</span>
            <span className="text-[8px] font-black uppercase tracking-wider">Dashboard</span>
          </button>

          <button
            onClick={() => {
              setEditingEstimateId(null);
              navigateToTab('create_estimate');
            }}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
              currentTab === 'create_estimate' ? 'text-blue-400 font-black scale-105' : 'text-slate-400'
            }`}
          >
            <span className="text-base mb-0.5">⚡</span>
            <span className="text-[8px] font-black uppercase tracking-wider">Fast Bill</span>
          </button>

          <button
            onClick={() => navigateToTab('products')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
              currentTab === 'products' ? 'text-blue-400 font-black scale-105' : 'text-slate-400'
            }`}
          >
            <span className="text-base mb-0.5">📦</span>
            <span className="text-[8px] font-black uppercase tracking-wider">Stock</span>
          </button>

          <button
            onClick={() => navigateToTab('clients')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
              currentTab === 'clients' ? 'text-blue-400 font-black scale-105' : 'text-slate-400'
            }`}
          >
            <span className="text-base mb-0.5">👥</span>
            <span className="text-[8px] font-black uppercase tracking-wider">Parties</span>
          </button>

          <button
            onClick={() => navigateToTab('statements')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
              currentTab === 'statements' ? 'text-blue-400 font-black scale-105' : 'text-slate-400'
            }`}
          >
            <span className="text-base mb-0.5">🧾</span>
            <span className="text-[8px] font-black uppercase tracking-wider">Ledger</span>
          </button>

          <button
            onClick={() => navigateToTab('settings')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
              currentTab === 'settings' ? 'text-blue-400 font-black scale-105' : 'text-slate-400'
            }`}
          >
            <span className="text-base mb-0.5">⚙️</span>
            <span className="text-[8px] font-black uppercase tracking-wider">Settings</span>
          </button>
        </nav>

        {/* ----------------- MOBILE MODAL 1: ADD PRODUCT OVERLAY bottom sheet ----------------- */}
        {showMobileAddProduct && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center animate-fade-in select-none">
            <div className="bg-white w-full rounded-t-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">➕ Add New Product</h3>
                <button
                  onClick={() => setShowMobileAddProduct(false)}
                  className="text-slate-400 hover:text-slate-600 font-black text-lg p-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={(ev) => {
                ev.preventDefault();
                const formData = new FormData(ev.currentTarget);
                const name = formData.get('name') as string;
                const sku = formData.get('sku') as string;
                const price = parseFloat(formData.get('price') as string) || 0;
                const mrp = parseFloat(formData.get('mrp') as string) || 0;
                const purchasePrice = parseFloat(formData.get('purchasePrice') as string) || 0;
                const stock = parseInt(formData.get('stock') as string) || 0;

                if (!name || !sku) {
                  showToast("Please fill Name and SKU!");
                  return;
                }

                handleAddNewProduct({
                  id: Date.now() + Math.random(),
                  name,
                  sku,
                  price,
                  mrp,
                  purchasePrice,
                  stock,
                  unit: 'PCS'
                });

                showToast(`Success: Added ${name}!`);
                setShowMobileAddProduct(false);
              }} className="space-y-4 text-xs">
                <div>
                  <label className="font-extrabold text-slate-500 block mb-1">Product Name</label>
                  <input
                    name="name"
                    required
                    placeholder="e.g. Parle-G Gold Large"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-extrabold text-slate-500 block mb-1">SKU / Barcode</label>
                    <input
                      name="sku"
                      required
                      placeholder="e.g. PG902"
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-extrabold text-slate-500 block mb-1">Opening Stock</label>
                    <input
                      name="stock"
                      type="number"
                      defaultValue="10"
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="font-extrabold text-slate-500 block mb-1">Sales Price</label>
                    <input
                      name="price"
                      type="number"
                      required
                      placeholder="₹"
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-extrabold text-slate-500 block mb-1">MRP</label>
                    <input
                      name="mrp"
                      type="number"
                      required
                      placeholder="₹"
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-extrabold text-slate-500 block mb-1">Purchase Rate</label>
                    <input
                      name="purchasePrice"
                      type="number"
                      placeholder="₹"
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-xs font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider py-3.5 rounded-xl transition-all cursor-pointer shadow-md shadow-blue-500/15"
                >
                  Save Product to Inventory
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ----------------- MOBILE MODAL 2: CUSTOMER LEDGER STATEMENT OVERLAY ----------------- */}
        {selectedLedgerClient && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center animate-fade-in select-none">
            <div className="bg-white w-full rounded-t-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <div className="space-y-0.5">
                  <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">🧾 Ledger Statement</h3>
                  <span className="text-[10px] text-slate-450 font-bold block">{selectedLedgerClient.name} ({selectedLedgerClient.phone})</span>
                </div>
                <button
                  onClick={() => setSelectedLedgerClient(null)}
                  className="text-slate-400 hover:text-slate-600 font-black text-lg p-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Ledger computations */}
              {(() => {
                const clientInvoices = dbEstimates.filter(e => isEstimateForClient(e, selectedLedgerClient));
                const totalPurchased = clientInvoices.reduce((sum, e) => sum + e.grandTotal, 0);
                const totalPaid = clientInvoices.reduce((sum, e) => sum + e.paidAmount, 0);
                const totalBalanceDue = clientInvoices.reduce((sum, e) => sum + e.balanceDue, 0);

                return (
                  <div className="space-y-4">
                    {/* Stat boxes */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-50 p-2.5 rounded-xl">
                        <span className="text-[8px] uppercase tracking-wider text-slate-400 font-extrabold block">Purchased</span>
                        <span className="font-black text-slate-800 text-xs block font-mono">₹{totalPurchased.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="bg-emerald-50/40 p-2.5 rounded-xl border border-emerald-100/30">
                        <span className="text-[8px] uppercase tracking-wider text-emerald-600 font-extrabold block">Total Paid</span>
                        <span className="font-black text-emerald-600 text-xs block font-mono">₹{totalPaid.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="bg-red-50/40 p-2.5 rounded-xl border border-red-100/30">
                        <span className="text-[8px] uppercase tracking-wider text-red-500 font-extrabold block">Baki Balance</span>
                        <span className="font-black text-red-600 text-xs block font-mono">₹{totalBalanceDue.toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    {/* Chronological list of invoice ledger rows */}
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      <h4 className="font-extrabold text-slate-500 text-[10px] uppercase tracking-widest block mb-2">Chronological Invoice Logs</h4>
                      {clientInvoices.length === 0 ? (
                        <p className="text-center py-6 text-xs text-slate-400 italic font-medium">No invoice activities recorded</p>
                      ) : (
                        clientInvoices.map((e) => (
                          <div key={e.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                            <div className="space-y-0.5">
                              <span className="font-black text-slate-800 block">{e.serial}</span>
                              <span className="text-[10px] text-slate-400 block font-mono">{e.date}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-black text-slate-850 block font-mono">₹{e.grandTotal.toLocaleString('en-IN')}</span>
                              <span className={`text-[9px] font-bold block ${e.status === 'PAID' ? 'text-emerald-600' : e.status === 'PARTIAL' ? 'text-blue-500' : 'text-red-500'}`}>
                                {e.status} (Paid ₹{e.paidAmount})
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Actions */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <a
                        href={`https://wa.me/91${selectedLedgerClient.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                          `Dear ${selectedLedgerClient.name},\nYour ledger statement summary as of today at ${businessName}:\n- Total Purchased: ₹${totalPurchased.toLocaleString('en-IN')}\n- Total Paid: ₹${totalPaid.toLocaleString('en-IN')}\n- Net Pending Baki: ₹${totalBalanceDue.toLocaleString('en-IN')}\n\nPlease clear the outstanding dues. Thank you!`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-green-500 hover:bg-green-600 text-white font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all block text-center shadow-sm"
                      >
                        💬 Send Professional WhatsApp Reminder
                      </a>
                      <button
                        onClick={() => setSelectedLedgerClient(null)}
                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-3 rounded-xl cursor-pointer transition-colors text-center block"
                      >
                        Close Statement
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ----------------- FULL-SCREEN PRINT MODAL PORTAL (MOBILE) ----------------- */}
        {/* Keeps entire background Dashboard and mobile views mounted with zero state loss */}
        {activePrintEstimate && typeof document !== 'undefined' && createPortal(
          <div className="print-modal-portal fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-xs overflow-y-auto print:static print:bg-white print:overflow-visible print:inset-auto print:z-auto print:p-0 print:m-0">
            <PrintInvoice
              estimate={activePrintEstimate}
              businessName={businessName}
              currentUser={currentUser}
              autoTriggerPrint={autoTriggerPrintOnOpen}
              onAutoPrintTriggered={() => setAutoTriggerPrintOnOpen(false)}
              onClose={() => {
                setActivePrintEstimate(null);
                setAutoTriggerPrintOnOpen(false);
              }}
              onOpenCustomizer={() => {
                setActivePrintEstimate(null);
                setAutoTriggerPrintOnOpen(false);
                navigateToTab('print_customizer');
              }}
            />
          </div>,
          document.body
        )}

        <KeyboardShortcutModal
          isOpen={showShortcutGuideModal}
          onClose={() => setShowShortcutGuideModal(false)}
          onTriggerShortcut={handleTriggerShortcutAction}
        />

        <ConfirmModalHost />
      </div>
    );
  }

  const currentLoggedUser = dbUsers.find(u => u.phone === currentUser);
  const currentLoggedUserEmail = currentLoggedUser?.email || getSavedPrintConfig(businessName, currentUser || undefined).email || '';

  return (
    <div key={renderKey} className="flex flex-col md:flex-row min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <ConfirmModalHost />
      <KeyboardShortcutModal
        isOpen={showShortcutGuideModal}
        onClose={() => setShowShortcutGuideModal(false)}
        onTriggerShortcut={handleTriggerShortcutAction}
      />
      
      {/* ----------------- RETAIL COUNTER AUTO-LOCK OVERLAY ----------------- */}
      <CounterLockScreen
        isLocked={isCounterLocked}
        lockConfig={appSettings.counterLock}
        businessName={businessName}
        currentUser={currentUser}
        userEmail={currentLoggedUserEmail}
        onUnlock={() => setIsCounterLocked(false)}
        onUpdateLockConfig={handleUpdateLockConfig}
        onShowToast={showToast}
      />
      
      {/* Toast notifications */}
      {toastMessage && (
        <div className="fixed top-5 right-5 bg-slate-900 text-white font-bold text-xs py-3 px-6 rounded-2xl shadow-xl border border-slate-750 flex items-center space-x-2.5 z-50 animate-bounce no-print">
          <CheckCircle className="w-4 h-4 text-emerald-450" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ----------------- SIDEBAR RAIL NAVIGATION ----------------- */}
      <aside className={`no-print bg-slate-950 text-slate-200 w-full flex-shrink-0 transition-all duration-300 flex flex-col justify-between border-r border-slate-900 select-none ${
        isSidebarMinimized ? 'md:w-20 p-4' : 'md:w-64 p-6'
      }`}>
        
        <div className="space-y-6">
          <div className={`flex ${isSidebarMinimized ? 'flex-col items-center gap-4 pb-4' : 'items-center justify-between pb-4'} border-b border-slate-900`}>
            {!isSidebarMinimized && (
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center font-black text-xl text-white shadow-md shadow-blue-500/20">
                  📘
                </div>
                <div>
                  <div className="flex items-center leading-none">
                    <span className="text-red-500 font-black text-lg tracking-tight">my</span>
                    <span className="text-white font-black text-lg tracking-tight">BillBook</span>
                  </div>
                  <span className="text-[9px] font-bold text-blue-400 mt-1 block uppercase tracking-wider">GST Billing & Accounting</span>
                </div>
              </div>
            )}
            {isSidebarMinimized && (
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center font-black text-xl text-white shadow-md shadow-blue-500/20">
                📘
              </div>
            )}
            
            {/* Toggle Handle Button */}
            <button
              onClick={() => setIsSidebarMinimized(!isSidebarMinimized)}
              className={`p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer hidden md:block ${isSidebarMinimized ? 'mt-2' : ''}`}
              title={isSidebarMinimized ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isSidebarMinimized ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Connected Session Status card */}
          {!isSidebarMinimized && (
            <div
              onClick={currentUserRole !== 'clerk' ? triggerOpenProfileModal : undefined}
              className={`bg-slate-900/60 p-3.5 rounded-2xl border border-slate-900/10 flex items-center space-x-3 transition-colors ${
                currentUserRole !== 'clerk' ? 'cursor-pointer hover:bg-slate-900' : ''
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-slate-800 text-blue-300 flex items-center justify-center text-xs border">
                {currentUserRole === 'clerk' ? '💼' : '👤'}
              </div>
              <div className="overflow-hidden">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none">
                  {currentUserRole === 'clerk' ? 'Billing Staff Session' : 'Owner Session'}
                </p>
                <span className="text-xs font-black text-white block mt-1 font-mono truncate">+91 {currentUser}</span>
                {currentUserRole !== 'clerk' && (
                  <span className="text-[8px] text-blue-400 font-bold hover:underline block mt-0.5 uppercase tracking-wide">Edit details</span>
                )}
              </div>
            </div>
          )}

          {/* Navigation rail buttons */}
          <nav className={`space-y-1.5 text-xs ${isSidebarMinimized ? 'flex flex-col items-center' : ''}`}>
            
            {currentUserRole !== 'clerk' && (
              <button
                onClick={() => { setEditingEstimateId(null); navigateToTab('dashboard'); }}
                className={`flex items-center rounded-xl font-bold hover:bg-slate-900 hover:text-white transition-all text-left cursor-pointer ${
                  isSidebarMinimized 
                    ? 'justify-center p-3 w-12 h-12 text-center' 
                    : 'w-full space-x-3 px-4 py-3'
                } ${
                  currentTab === 'dashboard' ? 'bg-blue-600 text-white hover:bg-blue-600 shadow-xs' : 'text-slate-400'
                }`}
                title="Dashboard & Reports"
              >
                <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
                {!isSidebarMinimized && <span>Dashboard</span>}
              </button>
            )}

            <button
              onClick={() => { setEditingEstimateId(null); navigateToTab('create_estimate'); }}
              className={`flex items-center rounded-xl font-bold hover:bg-slate-900 hover:text-white transition-all text-left cursor-pointer ${
                isSidebarMinimized 
                  ? 'justify-center p-3 w-12 h-12 text-center' 
                  : 'w-full space-x-3 px-4 py-3'
              } ${
                currentTab === 'create_estimate' ? 'bg-blue-600 text-white hover:bg-blue-600 shadow-xs' : 'text-slate-400'
              }`}
              title="Sales & Invoices"
            >
              <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
              {!isSidebarMinimized && <span>Sales / Invoices</span>}
            </button>

            <button
              onClick={() => { setEditingEstimateId(null); navigateToTab('products'); }}
              className={`flex items-center rounded-xl font-bold hover:bg-slate-900 hover:text-white transition-all text-left cursor-pointer ${
                isSidebarMinimized 
                  ? 'justify-center p-3 w-12 h-12 text-center' 
                  : 'w-full space-x-3 px-4 py-3'
              } ${
                currentTab === 'products' ? 'bg-blue-600 text-white hover:bg-blue-600 shadow-xs' : 'text-slate-400'
              }`}
              title="Items & Inventory"
            >
              <Layers className="w-4 h-4 flex-shrink-0" />
              {!isSidebarMinimized && <span>Items & Inventory</span>}
            </button>

            <button
              onClick={() => { setEditingEstimateId(null); navigateToTab('clients'); }}
              className={`flex items-center rounded-xl font-bold hover:bg-slate-900 hover:text-white transition-all text-left cursor-pointer ${
                isSidebarMinimized 
                  ? 'justify-center p-3 w-12 h-12 text-center' 
                  : 'w-full space-x-3 px-4 py-3'
              } ${
                currentTab === 'clients' ? 'bg-blue-600 text-white hover:bg-blue-600 shadow-xs' : 'text-slate-400'
              }`}
              title="Parties & Customers"
            >
              <Users className="w-4 h-4 flex-shrink-0" />
              {!isSidebarMinimized && <span>Parties & Customers</span>}
            </button>

            <button
              onClick={() => { setEditingEstimateId(null); navigateToTab('statements'); }}
              className={`flex items-center rounded-xl font-bold hover:bg-slate-900 hover:text-white transition-all text-left cursor-pointer ${
                isSidebarMinimized 
                  ? 'justify-center p-3 w-12 h-12 text-center' 
                  : 'w-full space-x-3 px-4 py-3'
              } ${
                currentTab === 'statements' ? 'bg-blue-600 text-white hover:bg-blue-600 shadow-xs' : 'text-slate-400'
              }`}
              title="Party Ledgers & Passbook"
            >
              <Landmark className="w-4 h-4 flex-shrink-0" />
              {!isSidebarMinimized && <span>Ledgers & Passbook</span>}
            </button>

            {currentUserRole !== 'clerk' && (
              <button
                onClick={() => { setEditingEstimateId(null); navigateToTab('print_customizer'); }}
                className={`flex items-center rounded-xl font-bold hover:bg-slate-900 hover:text-white transition-all text-left cursor-pointer ${
                  isSidebarMinimized 
                    ? 'justify-center p-3 w-12 h-12 text-center' 
                    : 'w-full space-x-3 px-4 py-3'
                } ${
                  currentTab === 'print_customizer' ? 'bg-blue-600 text-white hover:bg-blue-600 shadow-xs' : 'text-slate-400'
                }`}
                title="Invoice Print Customizer"
              >
                <Printer className="w-4 h-4 flex-shrink-0" />
                {!isSidebarMinimized && <span>Print Setup</span>}
              </button>
            )}

            {currentUserRole !== 'clerk' && (
              <button
                onClick={() => { setEditingEstimateId(null); navigateToTab('backup'); }}
                className={`flex items-center rounded-xl font-bold hover:bg-slate-900 hover:text-white transition-all text-left cursor-pointer ${
                  isSidebarMinimized 
                    ? 'justify-center p-3 w-12 h-12 text-center' 
                    : 'w-full space-x-3 px-4 py-3'
                } ${
                  currentTab === 'backup' ? 'bg-blue-600 text-white hover:bg-blue-600 shadow-xs' : 'text-slate-400'
                }`}
                title="Cloud Backup & Sync"
              >
                <Database className="w-4 h-4 flex-shrink-0" />
                {!isSidebarMinimized && <span>Backup & Sync</span>}
              </button>
            )}

            {currentUserRole !== 'clerk' && (
              <button
                onClick={() => { setEditingEstimateId(null); navigateToTab('settings'); }}
                className={`flex items-center rounded-xl font-bold hover:bg-slate-900 hover:text-white transition-all text-left cursor-pointer ${
                  isSidebarMinimized 
                    ? 'justify-center p-3 w-12 h-12 text-center' 
                    : 'w-full space-x-3 px-4 py-3'
                } ${
                  currentTab === 'settings' ? 'bg-blue-600 text-white hover:bg-blue-600 shadow-xs' : 'text-slate-400'
                }`}
                title="Settings & Business Profile"
              >
                <SettingsIcon className="w-4 h-4 flex-shrink-0" />
                {!isSidebarMinimized && <span>Settings</span>}
              </button>
            )}

            <button
              onClick={() => setShowShortcutGuideModal(true)}
              className={`flex items-center rounded-xl font-bold hover:bg-slate-900 hover:text-white text-slate-400 transition-all text-left cursor-pointer ${
                isSidebarMinimized 
                  ? 'justify-center p-3 w-12 h-12 text-center' 
                  : 'w-full justify-between px-4 py-3'
              }`}
              title="Keyboard Shortcut Guide (Press F1)"
            >
              <div className="flex items-center space-x-3">
                <Keyboard className="w-4 h-4 flex-shrink-0 text-blue-400" />
                {!isSidebarMinimized && <span>Shortcut Guide</span>}
              </div>
              {!isSidebarMinimized && (
                <span className="px-1.5 py-0.5 text-[9px] font-mono font-black bg-slate-800 text-blue-300 border border-slate-700 rounded">
                  F1
                </span>
              )}
            </button>

            <button
              onClick={() => setIsCounterLocked(true)}
              className={`flex items-center rounded-xl font-bold hover:bg-amber-950/40 hover:text-amber-300 text-amber-400/80 transition-all text-left cursor-pointer ${
                isSidebarMinimized 
                  ? 'justify-center p-3 w-12 h-12 text-center' 
                  : 'w-full space-x-3 px-4 py-3'
              }`}
              title="Lock Counter Now (Retail Protection)"
            >
              <Lock className="w-4 h-4 flex-shrink-0" />
              {!isSidebarMinimized && <span>Lock Counter</span>}
            </button>

          </nav>
        </div>

        {/* Trade logo details */}
        <div className={`pt-6 border-t border-slate-900 ${isSidebarMinimized ? 'flex flex-col items-center' : 'space-y-4'}`}>
          {!isSidebarMinimized && (
            <div>
              <h4 className="text-[9px] font-black tracking-wider text-slate-500 uppercase">Active Business Counter</h4>
              <span className="font-extrabold text-sm mt-1 text-white block max-w-[185px] truncate" title={businessName}>
                {businessName}
              </span>
            </div>
          )}

          <button
            onClick={handleLogout}
            className={`bg-red-950/40 hover:bg-red-900/30 border border-red-950/75 text-red-400 font-bold transition-all flex items-center justify-center cursor-pointer ${
              isSidebarMinimized ? 'p-3 rounded-xl w-12 h-12' : 'w-full py-2.5 rounded-xl text-xs space-x-1'
            }`}
            title="Sign Out"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!isSidebarMinimized && <span>Sign Out</span>}
          </button>
        </div>

      </aside>

      {/* ----------------- CONTAINER MAIN CORE FRAME ----------------- */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto no-print">

        {/* Subtle Background Auto-Save Status Header Bar */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-4 no-print select-none">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>{currentTab === 'dashboard' ? '📊 Dashboard & Reports' :
                    currentTab === 'create_estimate' ? '📝 Sales Invoice / Bill' :
                    currentTab === 'products' ? '📦 Items & Inventory Stock' :
                    currentTab === 'clients' ? '👥 Parties & Customers Directory' :
                    currentTab === 'statements' ? '🏦 Party Ledgers & Passbook' :
                    currentTab === 'print_customizer' ? '🖨️ Invoice Customizer & Print Setup' :
                    currentTab === 'settings' ? '⚙️ Settings & Configuration' :
                    currentTab === 'backup' ? '💾 Cloud Backup & Sync' : 'myBillBook'}</span>
            </h2>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              {businessName} • Connected user: +91 {currentUser}
            </p>
          </div>
          
          {/* Top Actions: Keyboard Shortcuts, Dark Mode, Quick Lock, Settings, & Cloud Status */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Keyboard Shortcut Guide Trigger (F1) */}
            <button
              type="button"
              onClick={() => setShowShortcutGuideModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-full text-[11px] font-bold shadow-xs transition-colors cursor-pointer"
              title="Open Keyboard Shortcut Guide (Press F1)"
            >
              <Keyboard className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Shortcuts</span>
              <kbd className="px-1.5 py-0.2 bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded text-[9px] font-mono font-black">
                F1
              </kbd>
            </button>

            {/* Dark Mode toggle */}
            <button
              type="button"
              onClick={() => handleToggleDarkMode(!appSettings.darkMode)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-full text-[11px] font-bold shadow-xs transition-colors cursor-pointer"
              title={appSettings.darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {appSettings.darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
              <span>{appSettings.darkMode ? "Light Mode" : "Dark Mode"}</span>
            </button>

            {/* Quick Counter Lock */}
            <button
              onClick={() => setIsCounterLocked(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[11px] font-bold shadow-xs transition-colors cursor-pointer"
              title="Lock retail counter session"
            >
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>Lock Counter</span>
            </button>

            {/* Quick Settings */}
            <button
              onClick={() => navigateToTab('settings')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${
                currentTab === 'settings'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
              title="Settings & Profile"
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>

            {/* Subtle Cloud Auto-Save Indicator */}
            {autoSaveStatus === 'synced' && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-full text-[11px] font-bold shadow-xs animate-fade-in">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Cloud Synced / Auto-Saved</span>
              </div>
            )}
            {autoSaveStatus === 'saving' && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200/60 rounded-full text-[11px] font-bold shadow-xs animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                <span>Auto-Saving...</span>
              </div>
            )}
            {autoSaveStatus === 'offline' && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-full text-[11px] font-bold shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span>Saved Offline (Pending Sync)</span>
              </div>
            )}
            {autoSaveStatus === 'error' && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200/60 rounded-full text-[11px] font-bold shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                <span>Auto-Save Failed</span>
              </div>
            )}
          </div>
        </div>

        {/* Sync Conflict Alert & Resolution Bar */}
        {syncConflictDetected && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm animate-fade-in no-print">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-xl mt-0.5">
                ⚠️
              </div>
              <div>
                <h4 className="font-extrabold text-amber-900 text-sm">
                  Sync Conflict Detected: Server has newer data
                </h4>
                <p className="text-xs text-amber-700 leading-relaxed mt-1 font-semibold">
                  Newer invoice, inventory, or customer data exists on the cloud server. Choose how you would like to synchronize your counter:
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              <button
                onClick={() => handleResolveConflict('server')}
                className="flex-1 md:flex-initial bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs shadow-xs transition-all cursor-pointer whitespace-nowrap"
                title="Download newest data from cloud server"
              >
                📥 Download Server Data
              </button>
              <button
                onClick={() => handleResolveConflict('local')}
                className="flex-1 md:flex-initial bg-white border border-amber-300 hover:bg-amber-50 active:scale-95 text-amber-850 font-bold px-4 py-2.5 rounded-xl text-xs transition-all cursor-pointer whitespace-nowrap"
                title="Keep my current local data and force upload to server"
              >
                📤 Force Upload Local Data
              </button>
              <button
                onClick={() => setSyncConflictDetected(false)}
                className="bg-transparent hover:bg-amber-100 p-2 text-amber-600 hover:text-amber-800 rounded-lg transition-colors cursor-pointer text-xs"
                title="Dismiss warning for now"
              >
                ✕ Dismiss
              </button>
            </div>
          </div>
        )}


        
        {currentTab === 'dashboard' && (
          <Dashboard
            estimates={dbEstimates}
            products={dbProducts}
            clients={dbClients}
            onEditEstimate={(id) => {
              setEditingEstimateId(id);
              navigateToTab('create_estimate');
            }}
            onPrintEstimate={(id) => {
              const matched = dbEstimates.find(e => e.id === id);
              if (matched) openPrintInvoice(matched);
            }}
            onDeleteEstimate={handleDeleteEstimate}
            onCreateNewClick={() => {
              setEditingEstimateId(null);
              navigateToTab('create_estimate');
            }}
            onAddNewProduct={() => navigateToTab('products')}
            onAddNewClient={() => navigateToTab('clients')}
            onViewLedgers={() => navigateToTab('statements')}
            onOpenPrintSetup={() => navigateToTab('print_customizer')}
            onNavigateToTab={navigateToTab}
            costFallbackPct={costFallbackPct}
            userRole={currentUserRole}
            isMobile={false}
            businessName={businessName}
          />
        )}

        {currentTab === 'create_estimate' && (
          <CreateEstimate
            clients={dbClients}
            products={dbProducts}
            estimates={dbEstimates}
            editingEstimateId={editingEstimateId}
            onSaveEstimate={handleSaveInvoice}
            onQuickPrintLatest={() => {
              if (dbEstimates.length > 0) {
                openPrintInvoice(dbEstimates[dbEstimates.length - 1], true);
              }
            }}
            onCancel={() => {
              setEditingEstimateId(null);
              goBack();
            }}
            onAddNewClient={handleAddNewClient}
            onAddNewProduct={handleAddNewProduct}
            userRole={currentUserRole}
            isMobile={false}
          />
        )}

        {currentTab === 'products' && (
          <Inventory
            products={dbProducts}
            onAddProduct={handleAddNewProduct}
            onEditProduct={handleEditProduct}
            onDeleteProduct={handleDeleteProduct}
            onBulkStockAdd={handleBulkStockAdd}
            onBulkRegProducts={handleBulkRegProducts}
            onScanBillImage={async (base64) => { await handleScanBillImage(base64); }}
            onBatchAddProducts={handleBatchAddProducts}
            onGlobalPriceMarkup={handleGlobalPriceMarkup}
            isScanning={isScanning}
            stockLogs={dbStockLogs}
            costFallbackPct={costFallbackPct}
            onUpdateCostFallbackPct={handleUpdateCostFallbackPct}
            userRole={currentUserRole}
          />
        )}

        {currentTab === 'clients' && (
          <Customers
            clients={dbClients}
            estimates={dbEstimates}
            onAddClient={handleAddNewClient}
            onEditClient={handleEditClient}
            onDeleteClient={handleDeleteClient}
            onViewLedger={(clientId) => {
              setSelectedStatementClientId(clientId || '');
              navigateToTab('statements');
            }}
            onEditEstimate={(id) => {
              setEditingEstimateId(id);
              navigateToTab('create_estimate');
            }}
            onPrintEstimate={(id) => {
              const matched = dbEstimates.find(e => e.id === id);
              if (matched) openPrintInvoice(matched);
            }}
            onDeleteEstimate={handleDeleteEstimate}
            userRole={currentUserRole}
          />
        )}

        {currentTab === 'statements' && (
          <Statements
            clients={dbClients}
            estimates={dbEstimates}
            businessName={businessName}
            userRole={currentUserRole}
            initialClientId={selectedStatementClientId}
            onUpdateClientPayments={handleUpdateClientPayments}
            onPrintEstimate={(id) => {
              const est = dbEstimates.find(e => e.id === id);
              if (est) {
                openPrintInvoice(est);
              }
            }}
            onEditEstimate={(id) => {
              setEditingEstimateId(id);
              navigateToTab('create_estimate');
            }}
          />
        )}

        {currentTab === 'backup' && (
          <Backup
            clients={dbClients}
            products={dbProducts}
            estimates={dbEstimates}
            users={dbUsers}
            currentUser={currentUser}
            onImportBackup={handleImportBackupRestore}
            onResetDatabase={handleWipeDatabaseReset}
            onSyncWithCloud={handleSyncDataWithServer}
            onForceUpload={() => handleResolveConflict('local')}
            onForceDownload={() => handleResolveConflict('server')}
            onRunHealthCheck={() => {
              // Self-healing database integrity check
              let issues = 0;
              const details: string[] = [];

              // 1. Check for negative prices or invalid totals
              dbEstimates.forEach(est => {
                if (est.grandTotal < 0) {
                  est.grandTotal = Math.max(0, est.grandTotal);
                  issues++;
                  details.push(`Corrected negative invoice total for invoice ${est.serial}`);
                }
              });

              // 2. Check for missing product SKUs
              dbProducts.forEach((p, idx) => {
                if (!p.sku || p.sku.trim() === '') {
                  p.sku = `SKU-${1000 + idx}`;
                  issues++;
                  details.push(`Generated missing SKU (${p.sku}) for product "${p.name}"`);
                }
              });

              if (issues > 0) {
                registerLocalMutation();
              }

              return { issuesFound: issues, fixedDetails: details };
            }}
            onOpenPrintCustomizer={() => navigateToTab('print_customizer')}
          />
        )}

        {currentTab === 'print_customizer' && (
          <PrintCustomizer
            businessName={businessName}
            estimates={dbEstimates}
            currentUser={currentUser}
            onNavigateToBilling={() => {
              setEditingEstimateId(null);
              navigateToTab('create_estimate');
            }}
          />
        )}

        {currentTab === 'settings' && (
          <Settings
            businessName={businessName}
            currentUser={currentUser}
            estimates={dbEstimates}
            onUpdateBusinessProfile={handleUpdateBusinessProfile}
            onLockCounterNow={() => setIsCounterLocked(true)}
            onShowToast={showToast}
            onSyncWithCloud={handleSyncDataWithServer}
          />
        )}

      </main>

      {/* ----------------- MODAL: PROFILE & PASSWORD EDIT SETTINGS ----------------- */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print select-none">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 border border-slate-10 shadow-2xl space-y-4">
            <h3 className="font-black text-base text-slate-800 flex items-center space-x-2">
              <UserCheck className="w-5 h-5 text-blue-600" />
              <span>Profile & Shop Settings</span>
            </h3>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-widest mb-1.5">Shop / Counter Billing Name</label>
                <input
                  type="text"
                  placeholder="e.g., Ram Store Counter"
                  value={profileBusinessName}
                  onChange={(e) => setProfileBusinessName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-widest mb-1.5">Registered Mobile ID</label>
                <input
                  type="text"
                  value={`+91 ${currentUser}`}
                  className="w-full bg-slate-100 border border-slate-150 p-3 rounded-xl font-bold font-mono text-slate-400 outline-none"
                  disabled
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-widest mb-1.5">Change Account Password (Optional)</label>
                <input
                  type="password"
                  placeholder="Enter new password"
                  value={profileNewPassword}
                  onChange={(e) => setProfileNewPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold outline-none focus:bg-white focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-widest mb-1.5">Staff Clerk Password</label>
                <input
                  type="text"
                  placeholder="Defaults to clerk123"
                  value={profileClerkPassword}
                  onChange={(e) => setProfileClerkPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold outline-none focus:bg-white focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-widest">Custom Gemini API Key (Required for PC Scanner)</label>
                  <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-[9px] font-bold">Get Key</a>
                </div>
                <input
                  type="password"
                  placeholder="Paste your Gemini API key here..."
                  value={profileCustomGeminiApiKey}
                  onChange={(e) => setProfileCustomGeminiApiKey(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold outline-none focus:bg-white focus:border-blue-500 transition-colors"
                />
                <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">Required only when running locally on PC. Get a free API key from Google AI Studio.</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 text-xs pt-2">
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-4 py-2.5 border border-slate-250 hover:bg-slate-50 rounded-xl font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfileChanges}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- FULL-SCREEN PRINT MODAL PORTAL (PC) ----------------- */}
      {/* Keeps entire background Dashboard and all PC views mounted with zero state loss */}
      {activePrintEstimate && typeof document !== 'undefined' && createPortal(
        <div className="print-modal-portal fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-xs overflow-y-auto print:static print:bg-white print:overflow-visible print:inset-auto print:z-auto print:p-0 print:m-0">
          <PrintInvoice
            estimate={activePrintEstimate}
            businessName={businessName}
            currentUser={currentUser}
            autoTriggerPrint={autoTriggerPrintOnOpen}
            onAutoPrintTriggered={() => setAutoTriggerPrintOnOpen(false)}
            onClose={() => {
              setActivePrintEstimate(null);
              setAutoTriggerPrintOnOpen(false);
            }}
            onOpenCustomizer={() => {
              setActivePrintEstimate(null);
              setAutoTriggerPrintOnOpen(false);
              navigateToTab('print_customizer');
            }}
          />
        </div>,
        document.body
      )}

    </div>
  );
}
