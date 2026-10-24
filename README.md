# Offline Billing System - Run on PC Guide 💻

यह गाइड आपको इस **Offline Billing System (ऑफलाइन बिलिंग सिस्टम)** को अपने कंप्यूटर/PC पर पूरी तरह से ऑफलाइन और सुरक्षित चलाने में मदद करेगी।

---

## 🇮🇳 हिंदी निर्देश (Hindi Instructions)

### 1. प्रोजेक्ट डाउनलोड करें (Download the Project)
* सबसे पहले, Google AI Studio के ऊपर दाईं ओर (Top right) **Settings** आइकॉन या **Export** बटन पर क्लिक करें।
* **Export as ZIP** चुनें ताकि यह पूरा कोड आपके PC पर डाउनलोड हो जाए।
* डाउनलोड की गई ZIP फ़ाइल को अपने कंप्यूटर पर किसी भी फ़ोल्डर में **Extract (Unzip)** करें।

### 2. Node.js इंस्टॉल करें (Install Node.js)
इस ऐप को आपके PC पर चलाने के लिए **Node.js** की आवश्यकता होती है।
* [https://nodejs.org/](https://nodejs.org/) पर जाएं।
* **LTS (Recommended for Most Users)** वर्ज़न डाउनलोड करके इंस्टॉल करें।

### 3. ऐप चालू करें (Start the App)
हमने आपके लिए इसे आसान बनाने के लिए एक ऑटोमेटिक स्टार्टर फ़ाइल बनाई है:
* अपने एक्सट्रेक्ट किए गए फ़ोल्डर में जाएं।
* वहाँ **`RUN-ON-PC.bat`** नाम की फ़ाइल होगी।
* इस फ़ाइल पर **Double-Click** करें।
* यह ऑटोमेटिकली सभी आवश्यक पैकेज सेटअप करेगी और आपके ब्राउज़र में ऐप को **`http://localhost:3000`** पर खोल देगी!

*नोट: अगली बार जब भी आपको बिलिंग सिस्टम इस्तेमाल करना हो, बस `RUN-ON-PC.bat` पर डबल-क्लिक करें।*

---

## 🇬🇧 English Instructions

### 1. Download the Project
* Click on the **Settings/Export** option on the top right in Google AI Studio.
* Select **Export as ZIP** to download the complete codebase.
* Extract (Unzip) the downloaded file in a folder on your computer.

### 2. Install Node.js
This app requires **Node.js** to run locally.
* Go to [https://nodejs.org/](https://nodejs.org/).
* Download and install the **LTS (Recommended for Most Users)** version.

### 3. Run the App
We have created a double-click script to automate everything:
* Open the extracted folder.
* Double-click on **`RUN-ON-PC.bat`**.
* It will automatically install the server modules and open the app in your browser at **`http://localhost:3000`**.

---

## 🛠️ Manual Execution (Developers / Command Line)
If you prefer running it manually via the terminal, use the following commands inside the project directory:

```bash
# 1. Install dependencies
npm install

# 2. Run in development mode
npm run dev

# 3. Build for production (Optional)
npm run build
```

This application uses **localStorage** to store bills, customers, estimates, and transactions safely right on your computer. Your data is 100% private and stays offline!
