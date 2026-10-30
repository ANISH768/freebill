# BillSync Pro — Offline & Multi-PC Billing System 💻📊

यह गाइड आपको **BillSync Pro (Offline + Cloud Multi-PC Billing System)** को **GitHub से डाउनलोड/क्लोन करके 1 या 2+ कंप्यूटर (PC) पर एक ही सर्वर और एक ही डेटा के साथ** चलाने में मदद करेगी।

---

## 🖥️ ↔️ 🖥️ 2 PC पर Same Server और Same Data के साथ कैसे चलाएं?

आपके पास **2 PC को एक ही डेटा और सर्वर से जोड़ने के 2 तरीके** हैं:

### 🌐 तरीका 1: Internet / Cloud Server से (सबसे आसान — कहीं से भी)
1. **PC 1** और **PC 2** दोनों के ब्राउज़र (Chrome / Edge) में यह **Live Shared Server Link** खोलें:
   - **Shared Cloud App URL:** `https://ais-pre-ors5jocb2d3y4wmv3kze4f-914398356752.europe-west2.run.app`
   - **Dev Cloud App URL:** `https://ais-dev-ors5jocb2d3y4wmv3kze4f-914398356752.europe-west2.run.app`
2. दोनों PC में **एक ही Business Mobile Number** और **Same Password** से लॉगिन करें।
   *(आप चाहें तो PC 1 पर **Admin/Owner** और PC 2 पर **Billing Clerk** रोल से भी उसी नंबर से लॉगिन कर सकते हैं।)*
3. **पहली बार Sync के लिए:** जिस PC में आपका पूरा डेटा है, उसमें **Left Sidebar → Backup & Sync** में जाकर एक बार **`📤 Force Upload PC Data to Cloud`** दबा दें।
4. इसके बाद दोनों PC में बनने वाले हर नए बिल (Invoices), स्टॉक (Inventory) और पार्टी (Customers) **Firebase Cloud Firestore + Server Sync** के ज़रिए हर 6 सेकंड और रियल-टाइम में अपने आप सिंक होते रहेंगे!

---

### 🔌 तरीका 2: Offline Same Wi-Fi / LAN Cable Server से (बिना इंटरनेट एक ही दुकान में)
अगर आप GitHub से कोड डाउनलोड करके बिना इंटरनेट (Offline LAN) 2 PC चलाना चाहते हैं:
1. सिर्फ **PC 1 (Main Counter Server)** पर प्रोजेक्ट डाउनलोड करें और **`RUN-ON-PC.bat`** पर डबल-क्लिक करें।
2. **PC 1** और **PC 2** दोनों को एक ही **Wi-Fi Router** या **LAN Switch** से कनेक्ट रखें।
3. `RUN-ON-PC.bat` शुरू होते ही टर्मिनल विंडो में (और ऐप के अंदर **Left Sidebar → Backup & Sync** में) **PC 1 का LAN IP Address** दिखेगा — उदाहरण के लिए:
   ```text
   http://192.168.1.5:3000
   ```
4. **PC 2 में कुछ भी इंस्टॉल करने की ज़रूरत नहीं है!** बस PC 2 के Chrome/Edge ब्राउज़र में वही `http://192.168.1.X:3000` खोलें और **Same Mobile Number** से लॉगिन करें।
5. दोनों PC एक ही लोकल सर्वर (`server_db.json`) और एक ही डेटा पर रीयल-टाइम में काम करेंगे।

---

## 🔑 Firebase & API Keys Configuration (GitHub Setup)

### 1. Firebase Cloud Firestore Config (`firebase-applet-config.json`)
इस रिपॉजिटरी में **`firebase-applet-config.json`** पहले से शामिल है, जो दोनों PC को आपके क्लाउड डेटाबेस से जोड़ती है:
```json
{
  "projectId": "named-lock-5khb0",
  "appId": "1:108155755567:web:76b2488c37dbb3d5783ada",
  "apiKey": "AIzaSyBCVGBc3zkxuGKaLxgaJTcDMki3UdgyV28",
  "authDomain": "named-lock-5khb0.firebaseapp.com",
  "firestoreDatabaseId": "ai-studio-remixofflinebill-db221ee9-8650-4c9c-9033-147ef2dfb1df",
  "storageBucket": "named-lock-5khb0.firebasestorage.app",
  "messagingSenderId": "108155755567"
}
```

### 2. Environment Variables (`.env` / `.env.example`)
जब आप `RUN-ON-PC.bat` चलाते हैं, तो वह अपने आप `.env.example` से `.env` फ़ाइल बना देता है।
यदि आप AI Purchase Bill OCR Scan इस्तेमाल करना चाहते हैं, तो `.env` फ़ाइल में अपनी `GEMINI_API_KEY` डाल सकते हैं:
```env
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
APP_URL="https://ais-pre-ors5jocb2d3y4wmv3kze4f-914398356752.europe-west2.run.app"
```
*(नोट: GitHub Push Protection सुरक्षा के कारण प्राइवेट सीक्रेट टोकन सीधे `.env.example` में रखने पर GitHub पुश ब्लॉक कर सकता है, इसलिए प्राइवेट कुंजी अपने PC की `.env` फ़ाइल या AI Studio Secrets में रखें।)*

---

## 🚀 नए PC पर चलाने के स्टेप्स (Quick Start on PC)

### 1. प्रोजेक्ट डाउनलोड या क्लोन करें
```bash
git clone <your-github-repo-url>
cd <repo-folder>
```
या GitHub से **Download ZIP** करके किसी भी फ़ोल्डर में **Extract (Unzip)** करें।

### 2. Node.js इंस्टॉल करें
* [https://nodejs.org/](https://nodejs.org/) से **Node.js (LTS Version)** डाउनलोड करके इंस्टॉल करें।

### 3. `RUN-ON-PC.bat` चलाएं
* फ़ोल्डर में मौजूद **`RUN-ON-PC.bat`** पर **Double-Click** करें।
* यह अपने आप `npm install`, `.env` सेटअप और सर्वर (`http://localhost:3000` + LAN IP) चालू कर देगा।

---

## ⌨️ मुख्य कीबोर्ड शॉर्टकट्स और फ़ीचर्स
* **`F1`** : शॉर्टकट गाइड (Keyboard Shortcut Guide)
* **`F2`** : नया बिल बनाएं (Create New Sales Invoice)
* **`F3`** : बिल प्रिंट / प्रीव्यू (Print / Preview Bill)
* **`F4`** : तेज़ आइटम सर्च (Quick Product Search)
* **`Caps Lock`** :
  * **Caps Lock ON** होने पर सारा टेक्स्ट **ALL CAPITAL (`A-Z`)** में टाइप होगा।
  * **Caps Lock OFF** होने पर हर शब्द का **पहला अक्षर बड़ा और बाकी छोटे (`Auto Title Case`)** में अपने आप लिखा जाएगा।
