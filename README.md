# AppleRadar RO — 100% Gratuit 24/7 (GitHub Actions + GitHub Pages)

Monitor live pentru **17 site-uri din România** (P2P strict București, Refurbished și Case de Amanet) cu alerte automate pe email:

- **iPhone 16 Pro (≥ 256GB)** — alertă email sub **2.600 RON**
- **iPhone 16 Pro Max (≥ 256GB)** — alertă email sub **2.600 RON**
- **iPhone 17 (≥ 256GB)** — alertă email sub **2.600 RON**
- **iPhone 17 Pro (≥ 256GB)** — alertă email sub **3.200 RON**
- **iPhone 17 Pro Max (≥ 256GB)** — alertă email sub **3.200 RON**
- **AirPods Pro 3 (fără P2P, doar magazine & amanete verificate)** — alertă email sub **700 RON**

---

## Punere online 100% GRATUITĂ (24/7 cu PC-ul oprit, fără card bancar!)

Soluția optimă gratuită folosește **GitHub Actions + GitHub Pages** dintr-un singur cont GitHub gratuit:
- **Cost:** **0 lei / lună**, fără card bancar, minute **nelimitate** pe un repo public.
- **Alerte Email 24/7:** scanează automat toate cele 17 site-uri la fiecare **20 de minute** și îți trimite email când apare o ofertă sub prag (cu deduplicare SQLite în cache).
- **Site Live HTTPS 24/7:** publică automat dashboard-ul complet pe `https://<user>.github.io/apple-deal-radar/` (se încarcă instant pe telefon, fără sleep).
- **Confidențialitate totală:** adresa ta de email și parola Gmail stau criptate în **GitHub Secrets** și sunt complet eliminate din `dashboard.json` înainte de publicare.

### Pași rapizi (3 minute, o singură dată)

1. **Creează un repo PUBLIC pe GitHub** numit `apple-deal-radar` (https://github.com/new) — **nu** bifa README/gitignore (sunt deja create local).
2. **Urcă proiectul din PowerShell:**
   ```powershell
   cd C:\Users\jeanl\.gemini\antigravity\scratch\apple-deal-radar
   git remote add origin https://github.com/<USER_TAU>/apple-deal-radar.git
   git push -u origin main
   ```
3. **Adaugă datele de email în GitHub Secrets** (`Repo → Settings → Secrets and variables → Actions → New repository secret`):
   - `ALERT_EMAIL_TO` = adresa ta de email unde vrei alertele (ex. `vlad.enachescu.2006@gmail.com`)
   - `SMTP_USER` = adresa ta Gmail
   - `SMTP_PASS` = Gmail App Password (16 caractere de la https://myaccount.google.com/apppasswords — necesită Verificare în 2 pași activă)
4. **Activează GitHub Pages** (`Repo → Settings → Pages → Source`: alege **GitHub Actions**).
5. **Pornește prima rulare:** intră în tab-ul **Actions → AppleRadar RO → Run workflow**. În ~30 de secunde site-ul tău e live 24/7 la `https://<USER_TAU>.github.io/apple-deal-radar/` și alertele email sunt active non-stop!

### Schimbare praguri preț din GitHub (opțional)
În `Repo → Settings → Secrets and variables → Actions → tab-ul Variables` poți suprascrie oricând:
`THRESHOLD_IPHONE_16_PRO`, `THRESHOLD_IPHONE_16_PRO_MAX`, `THRESHOLD_IPHONE_17`, `THRESHOLD_IPHONE_17_PRO`, `THRESHOLD_IPHONE_17_PRO_MAX`, `THRESHOLD_AIRPODS_PRO_3`, `MIN_IPHONE_STORAGE_GB`.

---

## Rulare locală

```powershell
npm install
npm start
```
Deschide **http://localhost:3456**.
