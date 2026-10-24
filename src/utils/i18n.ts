// Multi-language internationalization (i18n) dictionary supporting all major languages
export type SupportedLanguage = 
  | 'en' // English (Default)
  | 'hi' // Hindi (हिंदी)
  | 'es' // Spanish (Español)
  | 'fr' // French (Français)
  | 'ar' // Arabic (العربية)
  | 'zh' // Chinese (中文)
  | 'ja' // Japanese (日本語)
  | 'de' // German (Deutsch)
  | 'ru' // Russian (Русский)
  | 'pt'; // Portuguese (Português)

export interface LanguageInfo {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  dir?: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी', flag: '🇮🇳', dir: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { code: 'zh', name: 'Chinese', nativeName: '简体中文', flag: '🇨🇳', dir: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', dir: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', dir: 'ltr' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', dir: 'ltr' }
];

export const TRANSLATIONS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.sales': 'Sales & Invoices',
    'nav.inventory': 'Items & Stock',
    'nav.customers': 'Customers & Parties',
    'nav.ledgers': 'Party Ledgers',
    'nav.printSetup': 'Print Setup',
    'nav.backup': 'Backup & Sync',
    'nav.settings': 'Settings',
    'nav.lockCounter': 'Lock Counter',
    'nav.signOut': 'Sign Out',
    
    // Header & Subtitles
    'header.dashboard': 'Dashboard & Business Reports',
    'header.sales': 'Sales Invoice & Fast Billing',
    'header.inventory': 'Items & Inventory Stock',
    'header.customers': 'Customer & Party Directory',
    'header.ledgers': 'Party Ledgers & Statement',
    'header.printSetup': 'Invoice Print Setup & Customizer',
    'header.backup': 'Cloud Backup & Data Sync',
    'header.settings': 'Settings & Business Profile',
    'header.connectedUser': 'Connected User',
    'header.synced': 'Cloud Synced / Auto-Saved',
    'header.saving': 'Auto-Saving...',
    'header.offline': 'Saved Offline (Pending Sync)',
    'header.failed': 'Auto-Save Failed',

    // Counter Lock
    'lock.title': 'Retail Counter Locked',
    'lock.subtitle': 'Enter counter security PIN or password to resume billing',
    'lock.enterPin': 'Enter Counter PIN',
    'lock.unlock': 'Unlock Counter',
    'lock.forgot': 'Forgot PIN / Recover Access',
    'lock.changePin': 'Change Lock PIN',
    'lock.autoLock': 'Auto-Lock Inactivity Timer',
    'lock.wrongPin': 'Incorrect PIN. Please try again.',
    'lock.attempts': 'failed attempts',
    'lock.secureCounter': 'Secure Retail Counter Session',
    'lock.setPin': 'Set Counter Lock PIN',
    'lock.currentPin': 'Current PIN',
    'lock.newPin': 'New 4-6 Digit PIN',
    'lock.confirmPin': 'Confirm New PIN',
    'lock.recoveryOtp': 'OTP Verification Recovery',
    'lock.otpSent': 'Verification code sent to',
    'lock.verifyOtp': 'Verify & Reset Password',
    'lock.resendOtp': 'Resend OTP in',

    // Settings
    'settings.title': 'Settings',
    'settings.subtitle': 'Manage business profile, appearance, language, security, and invoice preferences',
    'settings.tabProfile': 'Business Profile',
    'settings.tabSecurity': 'Counter Auto-Lock',
    'settings.tabAppearance': 'Dark Mode & Theme',
    'settings.tabLanguage': 'Language & Currency',
    'settings.tabInvoice': 'Print Customizer',
    'settings.tabNotifications': 'Notifications',
    'settings.tabBackup': 'Auto-Backup',
    
    // Profile
    'profile.bizName': 'Business Name',
    'profile.tagline': 'Tagline / Slogan',
    'profile.phone': 'Phone Number',
    'profile.email': 'Business Email',
    'profile.gstin': 'GSTIN / Tax ID',
    'profile.pan': 'PAN Number',
    'profile.state': 'State / Province',
    'profile.address': 'Registered Address',
    'profile.logo': 'Business Logo',
    'profile.uploadLogo': 'Upload Logo Image',
    'profile.removeLogo': 'Remove Logo',
    'profile.bankName': 'Bank Name',
    'profile.accountNo': 'Account Number',
    'profile.ifsc': 'IFSC / Routing Code',
    'profile.branch': 'Branch Name',
    'profile.upiId': 'UPI ID (Instant QR Pay)',
    'profile.save': 'Save Changes',
    'profile.saved': 'Settings saved successfully!',

    // Appearance & Dark Mode
    'appearance.darkMode': 'Dark Mode',
    'appearance.darkModeDesc': 'Enable dark slate color scheme for low-light retail counters and battery saving',
    'appearance.on': 'Enabled',
    'appearance.off': 'Disabled',

    // Language & Currency
    'lang.select': 'Select Application Language',
    'lang.instantSwitch': 'Interface updates immediately in selected language',
    'currency.select': 'Default Currency Symbol & Format',
    'tax.region': 'Tax Structure & Regional Compliance',

    // Billing Quick Words
    'billing.newBill': 'New Invoice',
    'billing.billTo': 'Bill To',
    'billing.date': 'Date',
    'billing.dueDate': 'Due Date',
    'billing.subtotal': 'Subtotal',
    'billing.tax': 'Tax',
    'billing.discount': 'Discount',
    'billing.grandTotal': 'Grand Total',
    'billing.received': 'Received',
    'billing.balanceDue': 'Balance Due',
    'billing.saveAndPrint': 'Save & Print Bill',
    'billing.saveOnly': 'Save Invoice Only',
    'billing.selectTheme': 'Select Invoice Theme'
  },

  hi: {
    // Navigation
    'nav.dashboard': 'डैशबोर्ड',
    'nav.sales': 'बिक्री और बिलिंग',
    'nav.inventory': 'आइटम और स्टॉक',
    'nav.customers': 'ग्राहक और पार्टियां',
    'nav.ledgers': 'खाताबही लेजर',
    'nav.printSetup': 'प्रिंट सेटिंग्स',
    'nav.backup': 'बैकअप और सिंक',
    'nav.settings': 'सेटिंग्स',
    'nav.lockCounter': 'काउंटर लॉक करें',
    'nav.signOut': 'लॉग आउट',
    
    // Header & Subtitles
    'header.dashboard': 'डैशबोर्ड और व्यापार रिपोर्ट्स',
    'header.sales': 'सेल्स इनवॉइस और फास्ट बिलिंग',
    'header.inventory': 'आइटम और स्टॉक इन्वेंटरी',
    'header.customers': 'ग्राहक और पार्टी डायरेक्टरी',
    'header.ledgers': 'पार्टी खाताबही और स्टेटमेंट',
    'header.printSetup': 'बिल प्रिंट सेटअप और कस्टमाइज़र',
    'header.backup': 'क्लाउड बैकअप और डेटा सिंक',
    'header.settings': 'सेटिंग्स और व्यापार प्रोफाइल',
    'header.connectedUser': 'संबद्ध उपयोगकर्ता',
    'header.synced': 'क्लाउड सिंक / सुरक्षित',
    'header.saving': 'सेव हो रहा है...',
    'header.offline': 'ऑफ़लाइन सेव्ड (सिंक लंबित)',
    'header.failed': 'ऑटो-सेव असफल',

    // Counter Lock
    'lock.title': 'रिटेल काउंटर लॉक है',
    'lock.subtitle': 'बिलिंग जारी रखने के लिए काउंटर सुरक्षा पिन या पासवर्ड दर्ज करें',
    'lock.enterPin': 'काउंटर पिन दर्ज करें',
    'lock.unlock': 'काउंटर अनलॉक करें',
    'lock.forgot': 'पासवर्ड भूल गए / OTP से पुनर्प्राप्ति',
    'lock.changePin': 'लॉक पिन बदलें',
    'lock.autoLock': 'निष्क्रियता ऑटो-लॉक टाइमर',
    'lock.wrongPin': 'गलत पिन। कृपया पुनः प्रयास करें।',
    'lock.attempts': 'असफल प्रयास',
    'lock.secureCounter': 'सुरक्षित रिटेल काउंटर सत्र',
    'lock.setPin': 'काउंटर लॉक पिन सेट करें',
    'lock.currentPin': 'वर्तमान पिन',
    'lock.newPin': 'नया 4-6 अंकों का पिन',
    'lock.confirmPin': 'नए पिन की पुष्टि करें',
    'lock.recoveryOtp': 'OTP सत्यापन पुनर्प्राप्ति',
    'lock.otpSent': 'सत्यापन कोड भेजा गया',
    'lock.verifyOtp': 'सत्यापित करें और पासवर्ड रीसेट करें',
    'lock.resendOtp': 'पुनः OTP भेजें',

    // Settings
    'settings.title': 'सेटिंग्स',
    'settings.subtitle': 'व्यापार प्रोफाइल, डार्क मोड, भाषा, सुरक्षा और बिल प्राथमिकताओं का प्रबंधन करें',
    'settings.tabProfile': 'व्यापार प्रोफाइल',
    'settings.tabSecurity': 'काउंटर ऑटो-लॉक',
    'settings.tabAppearance': 'डार्क मोड और थीम',
    'settings.tabLanguage': 'भाषा और मुद्रा',
    'settings.tabInvoice': 'प्रिंट कस्टमाइज़र',
    'settings.tabNotifications': 'सूचनाएं व ध्वनि',
    'settings.tabBackup': 'ऑटो-बैकअप',

    // Profile
    'profile.bizName': 'व्यापार का नाम',
    'profile.tagline': 'टैगलाइन / स्लोगन',
    'profile.phone': 'मोबाइल नंबर',
    'profile.email': 'व्यापारिक ईमेल',
    'profile.gstin': 'GSTIN नंबर',
    'profile.pan': 'पैन नंबर',
    'profile.state': 'राज्य',
    'profile.address': 'व्यापार का पता',
    'profile.logo': 'दुकान का लोगो',
    'profile.uploadLogo': 'लोगो इमेज अपलोड करें',
    'profile.removeLogo': 'लोगो हटाएं',
    'profile.bankName': 'बैंक का नाम',
    'profile.accountNo': 'खाता संख्या',
    'profile.ifsc': 'IFSC कोड',
    'profile.branch': 'शाखा का नाम',
    'profile.upiId': 'UPI आईडी (QR भुगतान)',
    'profile.save': 'बदलाव सुरक्षित करें',
    'profile.saved': 'सेटिंग्स सफलतापूर्वक सहेजी गईं!',

    // Appearance & Dark Mode
    'appearance.darkMode': 'डार्क मोड',
    'appearance.darkModeDesc': 'कम रोशनी और बैटरी बचत के लिए डार्क स्लेट थीम चालू करें',
    'appearance.on': 'चालू',
    'appearance.off': 'बंद',

    // Language & Currency
    'lang.select': 'ऐप की भाषा चुनें',
    'lang.instantSwitch': 'चुनी गई भाषा तुरंत लागू होगी',
    'currency.select': 'डिफ़ॉल्ट मुद्रा प्रारूप',
    'tax.region': 'टैक्स संरचना और क्षेत्रीय अनुपालन',

    // Billing Quick Words
    'billing.newBill': 'नया इनवॉइस',
    'billing.billTo': 'ग्राहक',
    'billing.date': 'तारीख',
    'billing.dueDate': 'अंतिम तिथि',
    'billing.subtotal': 'उप-योग',
    'billing.tax': 'टैक्स / GST',
    'billing.discount': 'छूट',
    'billing.grandTotal': 'कुल राशि',
    'billing.received': 'प्राप्त राशि',
    'billing.balanceDue': 'बाक़ी राशि',
    'billing.saveAndPrint': 'बिल सेव और प्रिंट करें',
    'billing.saveOnly': 'सिर्फ सेव करें',
    'billing.selectTheme': 'बिल थीम चुनें'
  },

  es: {
    'nav.dashboard': 'Panel Principal',
    'nav.sales': 'Ventas y Facturación',
    'nav.inventory': 'Artículos y Stock',
    'nav.customers': 'Clientes y Partes',
    'nav.ledgers': 'Libro Mayor',
    'nav.printSetup': 'Ajustes de Impresión',
    'nav.backup': 'Copia y Sincronización',
    'nav.settings': 'Configuración',
    'nav.lockCounter': 'Bloquear Mostrador',
    'nav.signOut': 'Cerrar Sesión',
    'header.dashboard': 'Panel y Reportes Comerciales',
    'header.sales': 'Factura de Venta y Cobro Rápido',
    'header.inventory': 'Inventario y Existencias',
    'header.customers': 'Directorio de Clientes',
    'header.ledgers': 'Estados de Cuenta',
    'header.printSetup': 'Personalizador de Impresión',
    'header.backup': 'Sincronización en la Nube',
    'header.settings': 'Configuración y Perfil',
    'header.connectedUser': 'Usuario Conectado',
    'header.synced': 'Sincronizado / Guardado',
    'header.saving': 'Guardando...',
    'header.offline': 'Guardado Fuera de Línea',
    'header.failed': 'Fallo de Guardado',
    'lock.title': 'Mostrador Bloqueado',
    'lock.subtitle': 'Ingrese el PIN de seguridad para reanudar la facturación',
    'lock.enterPin': 'Ingrese PIN del Mostrador',
    'lock.unlock': 'Desbloquear Mostrador',
    'lock.forgot': 'Olvidé mi PIN / Recuperar',
    'lock.changePin': 'Cambiar PIN',
    'lock.autoLock': 'Temporizador de Auto-bloqueo',
    'lock.wrongPin': 'PIN incorrecto. Intente de nuevo.',
    'settings.title': 'Configuración',
    'settings.subtitle': 'Administre perfil comercial, modo oscuro, idioma y seguridad',
    'appearance.darkMode': 'Modo Oscuro',
    'appearance.darkModeDesc': 'Esquema de color oscuro para mostradores comerciales',
    'profile.bizName': 'Nombre Comercial',
    'profile.save': 'Guardar Cambios',
    'billing.grandTotal': 'Total a Pagar',
    'billing.saveAndPrint': 'Guardar e Imprimir'
  },

  fr: {
    'nav.dashboard': 'Tableau de bord',
    'nav.sales': 'Ventes & Factures',
    'nav.inventory': 'Articles & Stock',
    'nav.customers': 'Clients & Tiers',
    'nav.ledgers': 'Grand Livre',
    'nav.printSetup': 'Configuration Impression',
    'nav.backup': 'Sauvegarde & Synchro',
    'nav.settings': 'Paramètres',
    'nav.lockCounter': 'Verrouiller Caisse',
    'nav.signOut': 'Déconnexion',
    'header.dashboard': 'Tableau de bord & Rapports',
    'header.sales': 'Facture de Vente & Caisse',
    'header.inventory': 'Inventaire & Stocks',
    'header.customers': 'Répertoire Clients',
    'header.ledgers': 'Comptes Clients',
    'header.printSetup': 'Personnalisation des Factures',
    'header.backup': 'Sauvegarde Cloud',
    'header.settings': 'Paramètres & Profil',
    'lock.title': 'Caisse Verrouillée',
    'lock.subtitle': 'Entrez le code PIN pour reprendre les ventes',
    'lock.enterPin': 'Entrez le code PIN',
    'lock.unlock': 'Déverrouiller Caisse',
    'lock.forgot': 'Code oublié / Récupération',
    'settings.title': 'Paramètres',
    'appearance.darkMode': 'Mode Sombre',
    'appearance.darkModeDesc': 'Thème sombre pour un meilleur confort visuel',
    'profile.bizName': 'Nom de l’entreprise',
    'profile.save': 'Enregistrer',
    'billing.grandTotal': 'Total Général',
    'billing.saveAndPrint': 'Enregistrer & Imprimer'
  },

  ar: {
    'nav.dashboard': 'لوحة التحكم',
    'nav.sales': 'المبيعات والفواتير',
    'nav.inventory': 'الأصناف والمخزون',
    'nav.customers': 'العملاء والجهات',
    'nav.ledgers': 'دفتر الحسابات',
    'nav.printSetup': 'إعدادات الطباعة',
    'nav.backup': 'النسخ الاحتياطي والمزامنة',
    'nav.settings': 'الإعدادات',
    'nav.lockCounter': 'قفل نقطة البيع',
    'nav.signOut': 'تسجيل الخروج',
    'header.dashboard': 'لوحة التحكم والتقارير المالية',
    'header.sales': 'فواتير المبيعات ونقاط البيع السريعة',
    'header.inventory': 'المخزون والأصناف',
    'header.customers': 'سجل العملاء',
    'header.ledgers': 'دفاتر الحسابات وكشوف الحساب',
    'header.printSetup': 'تخصيص قوالب الفواتير',
    'header.backup': 'النسخ السحابي الاحتياطي',
    'header.settings': 'الإعدادات والملف التعريفي',
    'lock.title': 'نقطة البيع مقفلة',
    'lock.subtitle': 'أدخل رمز الأمان لمتابعة عمليات البيع',
    'lock.enterPin': 'أدخل رمز PIN',
    'lock.unlock': 'فتح نقطة البيع',
    'lock.forgot': 'نسيت الرمز / استرداد عبر OTP',
    'settings.title': 'الإعدادات',
    'appearance.darkMode': 'الوضع الداكن',
    'appearance.darkModeDesc': 'تفعيل المظهر الليلي الموفر للطاقة والمريح للعين',
    'profile.bizName': 'اسم المنشأة أو المتجر',
    'profile.save': 'حفظ التغييرات',
    'billing.grandTotal': 'الإجمالي الكلي',
    'billing.saveAndPrint': 'حفظ وطباعة الفاتورة'
  },

  zh: {
    'nav.dashboard': '仪表板',
    'nav.sales': '销售与开单',
    'nav.inventory': '商品与库存',
    'nav.customers': '客户与供应商',
    'nav.ledgers': '往来账簿',
    'nav.printSetup': '打印设置',
    'nav.backup': '备份与同步',
    'nav.settings': '系统设置',
    'nav.lockCounter': '锁定收银台',
    'nav.signOut': '退出登录',
    'header.dashboard': '业务仪表板与财务报表',
    'header.sales': '销售发票与快速收银',
    'header.inventory': '商品目录与库存管理',
    'header.customers': '客户通讯录',
    'header.ledgers': '客户往来对账单',
    'header.printSetup': '发票模板与打印自定义',
    'header.backup': '云端备份与数据同步',
    'header.settings': '系统设置与商户信息',
    'lock.title': '收银台已锁定',
    'lock.subtitle': '请输入安全密码以恢复收银操作',
    'lock.enterPin': '输入收银密码',
    'lock.unlock': '解锁收银台',
    'lock.forgot': '忘记密码 / 验证码重置',
    'settings.title': '设置',
    'appearance.darkMode': '深色模式',
    'appearance.darkModeDesc': '适用于夜间或低光照环境的深色护眼主题',
    'profile.bizName': '商户名称',
    'profile.save': '保存修改',
    'billing.grandTotal': '应付总额',
    'billing.saveAndPrint': '保存并打印发票'
  },

  ja: {
    'nav.dashboard': 'ダッシュボード',
    'nav.sales': '売上・請求書',
    'nav.inventory': '商品・在庫管理',
    'nav.customers': '顧客台帳',
    'nav.ledgers': '取引元帳',
    'nav.printSetup': '印刷設定',
    'nav.backup': 'バックアップ・同期',
    'nav.settings': '設定',
    'nav.lockCounter': 'レジロック',
    'nav.signOut': 'ログアウト',
    'lock.title': 'レジカウンターはロックされています',
    'lock.subtitle': '暗証番号を入力して業務を再開してください',
    'lock.enterPin': '暗証番号を入力',
    'lock.unlock': 'ロック解除',
    'lock.forgot': '暗証番号をお忘れの方',
    'settings.title': 'システム設定',
    'appearance.darkMode': 'ダークモード',
    'appearance.darkModeDesc': '店舗向け省電力ダークテーマ',
    'profile.bizName': '屋号・会社名',
    'profile.save': '設定を保存',
    'billing.grandTotal': '請求合計額',
    'billing.saveAndPrint': '保存して印刷'
  },

  de: {
    'nav.dashboard': 'Dashboard',
    'nav.sales': 'Verkauf & Rechnungen',
    'nav.inventory': 'Artikel & Lager',
    'nav.customers': 'Kunden & Partner',
    'nav.ledgers': 'Hauptbuch & Konten',
    'nav.printSetup': 'Druckeinstellungen',
    'nav.backup': 'Backup & Sync',
    'nav.settings': 'Einstellungen',
    'nav.lockCounter': 'Kasse sperren',
    'nav.signOut': 'Abmelden',
    'lock.title': 'Kassentheke gesperrt',
    'lock.subtitle': 'Sicherheits-PIN eingeben um fortzufahren',
    'lock.enterPin': 'Kassen-PIN eingeben',
    'lock.unlock': 'Kasse entsperren',
    'lock.forgot': 'PIN vergessen / Wiederherstellen',
    'settings.title': 'Einstellungen',
    'appearance.darkMode': 'Dunkelmodus',
    'appearance.darkModeDesc': 'Dunkles Farbschema für Kassensysteme',
    'profile.bizName': 'Geschäftsname',
    'profile.save': 'Änderungen speichern',
    'billing.grandTotal': 'Gesamtbetrag',
    'billing.saveAndPrint': 'Speichern & Drucken'
  },

  ru: {
    'nav.dashboard': 'Панель управления',
    'nav.sales': 'Продажи и Счета',
    'nav.inventory': 'Товары и Склад',
    'nav.customers': 'Клиенты и Контрагенты',
    'nav.ledgers': 'Книга счетов',
    'nav.printSetup': 'Настройки печати',
    'nav.backup': 'Резервное копирование',
    'nav.settings': 'Настройки',
    'nav.lockCounter': 'Заблокировать кассу',
    'nav.signOut': 'Выйти',
    'lock.title': 'Касса заблокирована',
    'lock.subtitle': 'Введите PIN-код для продолжения работы',
    'lock.enterPin': 'Введите PIN-код',
    'lock.unlock': 'Разблокировать',
    'lock.forgot': 'Забыли PIN / Восстановить',
    'settings.title': 'Настройки',
    'appearance.darkMode': 'Темная тема',
    'appearance.darkModeDesc': 'Темный режим для комфортной работы',
    'profile.bizName': 'Название компании',
    'profile.save': 'Сохранить изменения',
    'billing.grandTotal': 'Итого к оплате',
    'billing.saveAndPrint': 'Сохранить и распечатать'
  },

  pt: {
    'nav.dashboard': 'Painel Principal',
    'nav.sales': 'Vendas e Faturas',
    'nav.inventory': 'Itens e Estoque',
    'nav.customers': 'Clientes e Parceiros',
    'nav.ledgers': 'Livro Razão',
    'nav.printSetup': 'Configurar Impressão',
    'nav.backup': 'Backup e Sincronização',
    'nav.settings': 'Configurações',
    'nav.lockCounter': 'Bloquear Caixa',
    'nav.signOut': 'Sair',
    'lock.title': 'Balcão de Caixa Bloqueado',
    'lock.subtitle': 'Digite o PIN de segurança para continuar',
    'lock.enterPin': 'Digite o PIN',
    'lock.unlock': 'Desbloquear Caixa',
    'lock.forgot': 'Esqueci o PIN / Recuperar',
    'settings.title': 'Configurações',
    'appearance.darkMode': 'Modo Escuro',
    'appearance.darkModeDesc': 'Tema escuro para economia de bateria e conforto visual',
    'profile.bizName': 'Nome do Negócio',
    'profile.save': 'Salvar Alterações',
    'billing.grandTotal': 'Total Geral',
    'billing.saveAndPrint': 'Salvar e Imprimir'
  }
};

const STORAGE_LANG_KEY = 'app_selected_language';

export function getSavedLanguage(): SupportedLanguage {
  try {
    const saved = localStorage.getItem(STORAGE_LANG_KEY) as SupportedLanguage;
    if (saved && TRANSLATIONS[saved]) {
      return saved;
    }
  } catch {}
  return 'en';
}

export function saveLanguage(lang: SupportedLanguage): void {
  try {
    localStorage.setItem(STORAGE_LANG_KEY, lang);
    if (typeof document !== 'undefined') {
      const info = SUPPORTED_LANGUAGES.find(l => l.code === lang);
      document.documentElement.lang = lang;
      document.documentElement.dir = info?.dir || 'ltr';
    }
  } catch {}
}

export function t(key: string, lang?: SupportedLanguage, fallback?: string): string {
  const current = lang || getSavedLanguage();
  const dict = TRANSLATIONS[current] || TRANSLATIONS.en;
  if (dict[key]) return dict[key];
  if (TRANSLATIONS.en[key]) return TRANSLATIONS.en[key];
  return fallback || key;
}
