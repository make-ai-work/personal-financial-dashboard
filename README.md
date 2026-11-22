# Personal Financial Dashboard

A personal dashboard built step by step with React + Vite. Each section is a top-level tab
(add new ones in the `TABS` list in `src/App.jsx`).

## Run it on your own computer

You need [Node.js](https://nodejs.org) 18 or newer (free). Nothing else is installed and nothing is sent to a server.

```bash
git clone https://github.com/saurskr/personal-financial-dashboard   # or download the ZIP from GitHub and unzip it
cd personal-financial-dashboard
npm install        # once
npm start          # builds the app and serves it; then open http://localhost:4173 in your browser
```

Stop it with `Ctrl+C`. Run `npm start` again whenever you want to use it. If port 4173 is busy, pick another with
`npm start -- --port 5000` (the address matters if you later set up Google Drive, because Google remembers it).

- **Your data** is one encrypted file (`*.wvault`) that you create on the first screen. In Chrome and Edge the app saves straight
  back to it; in other browsers it asks you to download the file after changes. Keep the passphrase safe: there is no recovery.
- **Google Drive** is optional; the first screen lets you pick a vault file instead.
- **Hosting it elsewhere:** `npm run build` writes a static site to `dist/`. Upload that folder to any static host over HTTPS.
- **For development:** `npm run dev` (live reload), `npm test` (unit tests), and the end-to-end tests below.

```bash
npm test             # unit tests (encryption, data model, retirement engine, demo data, ...)
npm run build && npm run test:e2e && npm run test:e2e:countries && npm run test:e2e:property && npm run test:e2e:portfolio && npm run test:e2e:retirement && npm run build:nodefault && npm run test:e2e:flow && npm run test:e2e:home && npm run test:e2e:android
npm run build:demo && npm run test:e2e:demo      # the demo build
                     # end-to-end browser tests need Playwright + Chromium
```

## Home settings: weather and the market ticker

Open **⚙ Home settings** on the Home page. Everything there is kept in this browser (not in the encrypted file), so Home works before
you unlock your data. It persists between visits on this device but is **not encrypted**.

- **Weather and air quality** use [Open-Meteo](https://open-meteo.com) (free, no key) for the city where each country's main stock
  exchange is (New York, Mumbai, London, Sydney, Zurich). The coordinates are built in, so only those are sent. The temperature unit is
  automatic (°F in the US, °C elsewhere) unless you choose one. AQI is the US air quality index and is left out when there is no data.
- **Market data provider** (web and Android; pick one in Home settings, you bring your own key, none is built in):
  - **Alpha Vantage** (free key from alphavantage.co): index prices through ETF stand-ins, labelled on the ticker (S&P 500 as SPY, Nasdaq as
    QQQ, Nifty 50 as Nifty BeES, FTSE 100 as ISF, SMI as EWL). No Sensex, ASX 200, gold or Bitcoin. A free key allows 25 requests a day, so
    it refreshes every 6, 12 or 24 hours (each refresh uses up to 5 requests) and the last prices are kept if the limit is hit.
  - **FCS API** (below).
- **Market ticker** uses [FCS API](https://fcsapi.com). Paste your key and press **Test**. It shows S&P 500, Nasdaq, Sensex and Nifty 50,
  one main index for each other country in Finance → Settings (FTSE 100, ASX 200, SMI), gold (XAU/USD) and Bitcoin (BTC/USD).
  - **Plans:** FCS's free plan (500 calls a month) covers **gold and Bitcoin only**. **Index prices need an FCS stock plan** (from about
    $25 a month). With a free key the ticker still shows gold and Bitcoin and says why the indices are missing.
  - **Calls:** a refresh makes at most 3 calls (indices, gold, Bitcoin). Prices are cached and refreshed every 30 minutes by default
    (15/30/60 in settings), only while the page is visible, and indices only while one of their markets is open.
- **Market open/closed** is calculated from each exchange's regular hours and time zone. **Public holidays are not included**, so a
  holiday can show as open.
- The FCS symbols are in one file, `src/lib/ticker.js`.

## Android app

The Android app is this same web app packaged with [Capacitor](https://capacitorjs.com) (one codebase). **Your data is kept in the app's own private
storage by default, and Google Drive is an optional second choice** (the same two choices as every other version). The project is in `android/`.

**What you need:** [Android Studio](https://developer.android.com/studio) (it brings its own JDK and the Android SDK) and Node.js
**22 or newer** (Capacitor 8's tooling; the web app itself only needs 18).

```bash
npm install
npm run android:sync     # builds the web app and copies it into android/
npm run android:open     # opens the project in Android Studio; press Run to start it on an emulator or a plugged-in phone
```

After changing the web app, run `npm run android:sync` again before Run.

- **What is different in the app:** it opens on the same sign-in screen as every other version, then "Where should your data live?" (*Vault file*,
  kept inside the app, or *Google Drive*), then Home; and Settings → *Your data* has **Export backup…** (the phone's share sheet),
  *Last backup* (a reminder), **Restore…** (asks first, and only a valid backup ever replaces the vault) and **Delete…** (you must
  type DELETE). The Back button closes a dialog, then goes to Home, then leaves the app. The app locks itself when you come back after
  longer than your auto-lock time. Home's weather and prices need internet.
- **Where the data is:** one encrypted vault file in the app's private folder (not visible to other apps or the file manager), saved safely
  (a complete temporary copy is written first, so a crash mid-save cannot lose it). **Uninstalling the app or clearing its data deletes
  it**, so use *Export backup* now and then; backups are encrypted. Android's automatic cloud backup is switched off for the app.
- **App id:** `io.github.saurskr.dashboard` (in `capacitor.config.json` and `android/app/build.gradle`). Change both before publishing if
  you want a different one: Google Play never lets it change after release.
- **Icon and splash screen:** a simple placeholder drawn in the app's colours. Replace `assets/icon-only.png`, `icon-foreground.png` and
  `icon-background.png` (1024×1024) and run `npm run android:assets`.
- **Release to Google Play:** in Android Studio, *Build → Generate Signed App Bundle*. Create a signing key once and **keep it safe and
  out of git**; losing it means you cannot update the app.
- **Tests:** the app behaviour (first launch, create, relaunch and unlock, backup, restore, delete, Back button, lock after time away) is
  covered by `npm run test:e2e:android`, which runs the real screens against an in-memory stand-in for the phone's folder, share sheet and
  Back button, and by unit tests for the storage.
- **Status:** the project and the web side are tested, but the app has **not yet been compiled or run on a device or emulator** by this
  repository's authors, so expect a first round of fixes when you press Run. Things only a real phone can show: the edge-to-edge layout
  around the notch and gesture bar, the share sheet, and the file chooser for restoring.

## Demo site (GitHub Pages)

The public site is a **demo** with made-up sample data from `demo/demo-data.json`. The sign-in page is shown with Google
sign-in switched off and a **Demo Mode (skip sign in)** button; the app is fully editable, nothing is saved, and a reload resets it.

- Demo mode is a build setting in this same codebase (`VITE_DEMO=true`, set by `.env.demo`), not a copy of the app:
  `npm run dev:demo` to try it locally, `npm run build:demo` to build it (into `dist-demo/`).
- `.github/workflows/pages.yml` runs the tests, builds the demo and publishes it **when the `demo` branch is updated**.
  `main` never publishes. To refresh the showcase: merge `main` into `demo` (one way only).
- To change the sample data, edit `demo/build-demo-data.mjs` and run `node demo/build-demo-data.mjs` (it uses the app's own
  functions, so the file always matches the data model). Dates are moved forward each time the demo opens so it never looks stale.
- **Demo ticker prices** come straight from FCS API. The page asks FCS for a 24-hour token using only the **public** key in `.env.demo`
  (`VITE_FCS_PUBLIC_KEY`; it is public by design and only works from websites you list). One-time setup in the FCS dashboard:
  **Security → Allowed Domains (Public Key)**: add `saurskr.github.io` (and `localhost` to try it locally) and set **Token Expiry** to
  86400. No secret key is used anywhere. Each visit costs about four FCS calls (token + one per price group), and the free plan has 500 a
  month, so a busy demo can run out (the ticker then says so). Index prices need an FCS stock plan; on a free key only gold and Bitcoin appear.
- One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site is then at
  `https://<user>.github.io/<repo>/`. Assets use relative paths (`base: './'`), so any build works at a sub-path or any static host.
- `.github/workflows/ci.yml` runs the tests and both builds on every pull request and push to `main`.

## How the branches work

**One codebase, three deployments, each with its own data storage.**

```mermaid
flowchart TD
  F["Feature branches<br/>claude/… (one per piece of work)"] -- "pull request + tests" --> M["main<br/>one codebase"]
  M -- "merge main into demo<br/>(one way only)" --> D["Demo (planned)<br/>GitHub Pages"]
  M -- "download / clone" --> L["Local or self-hosted<br/>npm start, or any static web host"]
  M -- "release tag" --> A["Android app (planned)<br/>Google Play"]
  D --> SD(["Sample data<br/>demo/demo-data.json, read only"])
  L --> SL(["Your data<br/>encrypted file or Google Drive"])
  A --> SA(["Your data<br/>app storage or Google Drive"])
```

| Deployment | Built from | Data lives in |
|---|---|---|
| **Local or self-hosted** | `main` (download it, or host it anywhere) | an encrypted file you keep, or your own Google Drive |
| **Demo** | `demo`, updated from `main`, published by the workflow | sample data in `demo/demo-data.json`; nothing saved; Google sign-in off, Demo Mode button |
| **Android** | `main`, on a release tag | an encrypted file in app storage, or your Google Drive |

- New work starts from `main` on its own branch and returns by pull request. Code flows **one way** into `demo`, never back.
- Demo mode, local storage and Google Drive are settings inside `main`, not separate copies of the app.
- Google sign-in on Android uses a client ID registered for the Android app, different from the web one; this is decided when
  the Android app is built.

A picture version of this, which also ships with the site, is in
[`public/docs/branch-flow.html`](public/docs/branch-flow.html) (served at `/docs/branch-flow.html`).

## Tabs

- **Home** – the landing page. A rolling **market ticker** (always visible; dashes until prices load), a **Total net worth** card on the
  left (choose All, Mine, Joint, Spouse or Parent; everything converted into your first country's currency; unlock your data to see it),
  and on the right one compact block per country you selected in Finance → Settings: the **city of its main stock exchange**, the **time**
  (AM/PM with a day or night icon), **market open/closed** (or when it opens) and the **weather**. See "Home settings" below.
- **Retirement** – one page. The left column starts with your **saved plans** (up to three, stacked within the column's width; click a card or Open to choose one; the
  highlighted one is the plan you are on, with Save changes, Rename and Delete, and "+ New plan" for an empty slot), then the **inputs** (your situation including
  contribution growth, *Savings used* picked from Finance asset accounts, *Inheritance*, *Income in retirement* with the **insurance survivor benefit**
  tick-box, and market conditions with a staleness warning; the savings and inheritance sections fold to a one-line summary). The **chance of success**
  (with On track / Off track at your target, 85% by default) spans the width of the other two columns. Under it, in the middle: **results** (nest egg
  needed, projected balance, surplus or shortfall, extra saving needed) and **monthly income, planned vs projected**; on the right: the **charts**
  (**Projected Net Worth**, **Chance your savings last**, and folded: when it runs out, the 10-year-yield sensitivity table and a comparison of the saved plans).
  *Advanced* (volatility, correlations,
  the spending rule, target chance, number of runs and the seed) is under the columns. On a phone the order is plans, chance of success, results, charts, inputs.
  The simulation is 1,000 to 10,000 random futures in today's money (lognormal real returns per asset class, correlated, rebalanced yearly). The
  starting return, volatility and correlation figures are **placeholders, not forecasts**; edit them. **Inheritance** is a flat amount added to your
  savings in the calendar year you enter, exactly as typed (not inflation-adjusted); past years and years after the plan-to age are ignored. The
  **insurance survivor benefit** adds the death benefit of your Finance insurance policies to the nest egg at retirement. A saved plan stores its
  inputs and seed, and results are recalculated when you open it. Engine: `src/lib/montecarlo.js`; plan and saved plans: `src/lib/retirement.js`;
  screens: `src/retirement/`. Not included in the Excel export.
- **Property** – properties by country with a value history you enter (USA has an "Open on Zillow" link for
  looking up the Zestimate yourself), manually recorded mortgages (balance, principal, interest, escrow),
  equity and loan-to-value, reminders for mortgage payments and property tax, and monthly charts.
  Not counted in the Finance totals. Zillow has no public API and forbids scraping, so values are typed in.
- **Portfolio** – holdings per portfolio (stocks, ETFs, funds, bonds, cash) with prices you type in, linked to
  one of your Finance asset accounts: that account's balance and asset-mix bar are then calculated from the
  holdings. Allocation by asset class, sector, geography and portfolio, a single-stock concentration warning,
  stale-price flags, a bulk "Update prices" screen, and class-level rebalancing with a buy-only plan for new money.
  When you link an account, a difference between its typed balance and your holdings is added as an
  "unallocated" holding by default (or you accept the new total).
- **Finance Dashboard** – assets, liabilities and insurance for two countries (USA, India, UK,
  Australia or Switzerland; choose one to five, and Finance and Property each keep their own list), with a summary page, owner filter (Mine / Joint / Parent) and a
  month-by-month chart per country.

## Run as an app (Windows, no .exe)

Two ways to get the app in its own window with no tabs and no address bar. Neither is an `.exe`, so Smart App Control has nothing to block.

- **Double-click launcher (the local version).** Install [Node.js](https://nodejs.org) (LTS) once, then double-click **`Run as app.cmd`** in
  the project folder. The first run installs what the app needs and builds it; then your Edge (or Chrome) opens the app in its own window on
  `http://localhost:4173`. **Close the window to stop it.** Run `npm run shortcut` once to put a **Finance Dashboard** shortcut (with the app
  icon) on your Desktop and in the Start menu. Details: it keeps its own browser profile (so the app remembers your settings and your data
  file separately from your normal browsing), a second double-click reuses the running copy, and `node scripts/run-as-app.mjs --port 5000`,
  `--rebuild` and `BROWSER_PATH` / `BROWSER_ARGS` let you change the port, rebuild, or pick the browser.
- **Install from the browser (any address).** Open the web app (your own copy or the demo) in Edge or Chrome and use **Settings → This
  device → Install as app** (or the install icon in the address bar). You get a Start-menu and taskbar icon, a quick start, and it opens even
  without a connection (a small service worker keeps this app's own files; it never touches your data, prices, weather or Google).
  Not offered inside the Windows or Android apps.

For Google sign-in, authorise the address you use (`http://localhost:4173` for the launcher), as in "Google setup" below.

## Windows app (Electron)

The same app as a Windows program: a **portable `.exe`** (nothing to install) and an **installer**. It is the normal web app in its own
window, plus a small file bridge, so it saves straight into your encrypted data file with ordinary Open / Save dialogs and remembers
the file for next time (you only type the passphrase). Everything is in `electron/`.

- **Get the .exe:** on GitHub go to **Actions → Build Windows app → Run workflow**, then download `windows-app` from the finished run.
  Pushing a tag such as `v0.1.0` also attaches the files to a release. Or build it yourself: `npm install`, then `npm run win:build`;
  the files appear in `release/` (`FinanceDashboard-<version>-portable.exe` and the installer).
- **Try it without packaging:** `npm run win:dev` builds the web app and opens it in Electron.
- **Windows warning:** the files are not code-signed, so SmartScreen says "Windows protected your PC" the first time: **More info →
  Run anyway**. Signing needs a paid certificate.
- **Data:** only in the file you choose (the app never uploads it). The last file's path is remembered in the app's own settings folder.
  The page can only read or write files you picked in a dialog.
- **Google sign-in in this app** opens your normal browser (Google does not allow sign-in inside an app's own window). The app runs on
  the fixed address `http://localhost:53682`. In Google Cloud, on your **Web application** client, add
  `http://localhost:53682/oauth-callback` under **Authorized redirect URIs** (Settings → Account → Use my own… shows it and has a Copy button).
  If another program already uses port 53682 the app says so and does not start.
- **Tests:** `npm test` (server, sign-in return, file allow-list) and, on Linux with a virtual screen,
  `npm run build && xvfb-run -a npm run test:e2e:windows` runs the real Electron app. The packaged `.exe` has not been run on a real
  Windows machine in development, so tell me about anything odd.

## Sign-in and storage: the same screen flow on every version

Demo site, web, installed web app, Windows app and Android app all open the same way:

**1. Sign in → 2. Where should your data live? → 3. Unlock (only if a vault already exists) → 4. Home.** Every sign-in lands on Home.

1. **Sign in** is always the first screen. **Sign in with Google** (behind the quick check) opens Google's page; once it is done you go to step 2.
   **Continue without signing in** logs you in as **Demo User**: sample data, a *Demo Mode* banner ("Change anything you like: it stays in this
   session and is gone when you reload. Nothing is saved or sent."), and no saving. On the demo site the Google button is greyed out; the screen is
   otherwise identical. A copy built without a Google client ID greys it out too, and says why.
2. **Where should your data live?** (after Google sign-in): **Vault file** (Android: inside the app; Windows and web: a `.wvault` file in a
   folder you choose, remembered) or **Google Drive**. After *Continue without signing in* both are greyed out and only
   **Demo mode – nothing will be saved** works. There are no save options on the Assets tab any more.
3. **Unlock:** if a vault is already remembered on this device, signing in goes straight to the passphrase.
4. **Home:** always the landing page. (The Finance tab is now **💲 Assets**.)

| | Web / installed web app | Windows app | Android app |
|---|---|---|---|
| **Sign in with Google** | Google's page | opens your browser | the phone's Google account |
| **Vault file** | a folder you choose, remembered | a folder you choose, exact path remembered | kept inside the app |
| **Google Drive** | yes | yes | yes |

- **Nothing about who you are is stored.** Name and email live in memory for the session, so closing the app signs you out. Quiet sign-in at start
  (web) only works if Google already has you signed in. Your data is protected by its own passphrase either way.
- **Settings → Account & sign-in:** in demo mode it offers **Sign in with Google**. Signing in there shows "Where should your data live?" and
  **your demo changes go into the vault you choose** (nothing is saved until you choose). Once a vault is in use you see where it lives and can
  **move** it. **Google connection** shows only **Use my own…** (your own Google client ID, kept in this browser, never displayed; the form has a small
  link to go back to the app's own). The two-step verification preview has been removed.
- **Moving between Vault file and Google Drive** (Settings → Your data & security → *Move your data*): the encrypted vault is copied, the copy is read
  back and checked, and only then does the app switch. **The old copy is never deleted for you.** A notice says exactly where it still is and that it
  is no longer updated, with **Delete old copy…** (asks you to confirm; a Drive copy goes to the Drive bin) or **Keep it, stop reminding me**.
- **Danger zone → Wipe data…** (type WIPE): resets the vault and erases the data in its current storage (the app's vault file, the chosen
  `.wvault` file, or the Google Drive file, permanently), forgets it on this device, and returns to "Where should your data live?". The unlock screen
  has the same thing as *Forgot the passphrase? Wipe data…*. An old copy left by an earlier move is not touched.
- **Code:** `src/lib/channel.js` (the choices), `src/lib/nativegoogle.js` (Android), `src/lib/googleauth.js`, `src/auth/` (sign-in), `src/finance/Gate.jsx`
  (Where-to-save and unlock), `src/settings/SettingsPage.jsx`.

## Google Drive storage (optional)

You can keep the **encrypted** file in your own Google Drive, so it is on every device you sign in to. It is one choice next to *Vault file*, never
required, and the same on the web, the Windows app and the Android app (not the demo). It needs a Google client ID (the built-in one, or your own; see the next section) whose
Google Cloud project has the **Google Drive API** enabled.

- **Start screen:** **Create in Google Drive** creates the encrypted file in your Drive (the app refuses if one already exists, so nothing is
  overwritten by mistake); **Open from Google Drive** opens the one this app saved before. From **Settings → Your data & security** you can
  **Move to Google Drive…** or **Move to a vault file…** (see above: the old copy stays until you delete it).
- **What leaves your device:** only the encrypted file (`WealthTracker.wvault`). The passphrase and your data never do. The app asks Google for
  the **`drive.file`** scope: it can only see files this app created, nothing else in your Drive, and it can't read your mail or contacts.
  The file is visible in My Drive, so you can see it, download it, or restore an earlier version there.
- **Nothing secret is stored:** Google's access pass lives in memory for about an hour. The web version renews it quietly while Google still has you
  signed in; the **Windows and Android apps cannot renew quietly**, so after about an hour of use the status bar shows **Reconnect Google Drive**
  (one click; your changes are kept meanwhile). Only the file's id and name are remembered on this device, to find it next time.
- **If a save cannot reach Drive** (the pass ran out, or you are offline) your changes stay in the open app and the status bar says so, with a
  **Reconnect Google Drive** button. Keep the app open until it says saved.
- **Two devices:** a save first checks the file has not changed since you opened it. If another device saved in between, nothing is
  overwritten: you choose **Keep my changes** (replace the Drive copy) or **Use the Drive version** (drop yours).
- **Tested with a stand-in for Google and Drive**, not against a real account, and **the Android and Windows Drive paths have not been run on a real phone or PC**, so tell me about anything odd.

### Android: Google Cloud setup (once)

The phone's Google account (Credential Manager) checks the app itself, so Android needs **one more OAuth client** in the same Google Cloud project:

1. **Credentials → Create credentials → OAuth client ID → Android.** Package name `io.github.saurskr.dashboard` (change it if you changed the app id), and the **SHA-1
   fingerprint** of the key the app is signed with. For a debug build (Android Studio Run): `keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android` (Windows).
   A release build or the Play Store build has its own fingerprint: add it as another Android client.
2. **Keep the Web client** you already have (the built-in `VITE_GOOGLE_CLIENT_ID`): the app passes it to Google as the *web client ID* alongside the Android client.
3. Enable the **Google Drive API**, and while the consent screen is in *Testing* add your Google account as a **test user**.
4. Changes in Google Cloud can take up to a few hours. If sign-in fails with *"Google does not recognise this Android app yet"* (Google error 28444), the
   package name or fingerprint does not match: check them in Logcat (filter `GoogleProvider`, it prints both).

The app's `MainActivity.java` is changed so the sign-in plugin can ask for the Drive permission; `npm run android:sync` keeps the plugin wired in.

## Google setup

The app ships with a **built-in Google client ID** (`VITE_GOOGLE_CLIENT_ID` in `.env`), so on the published site, the local app and the launcher you
just click **Sign in with Google**: nothing to set up. A client ID is public by design, and Google only accepts it from the addresses registered
for it in Google Cloud, so shipping it is safe. It never needs a client *secret* or an API key, and the app refuses to accept a secret.

- **Your own client ID instead:** **Settings → Account → Use my own…** (it is saved in the browser only). Do this if you host your own copy at a
  different address, or you want your own Google project. The form has a 6-step guide, the address to authorise, and a Copy button. Authorise
  the address you use under **Authorized JavaScript origins** (`http://localhost:4173` for the local app and launcher, your site address for a
  hosted copy), or **Authorized redirect URIs** `http://localhost:53682/oauth-callback` for the Windows app. For Google Drive storage also enable
  the **Google Drive API** in that project.
- **Without Google:** **Continue without signing in** (demo mode). In Settings → Account, **Use my own…** replaces the built-in client ID (its form can go back
  to the app's own). The demo site has no Google sign-in.
- **Shipping without a built-in ID:** empty `VITE_GOOGLE_CLIENT_ID` in `.env`; Google sign-in is then greyed out (demo mode still works) until someone adds their own client ID under Settings → Account → Use my own….
  (`npm run build:nodefault` builds that way into `dist-nodefault`; `npm run test:e2e:flow` uses it.)
- **While your Google project is in "Testing"** only the test users you listed can sign in; publish the consent screen to open it to anyone (no review
  is needed for the scopes used here).

## Country flags

Windows has no flag emoji of its own (it shows letters such as "US"), so the app bundles a small font that only covers the flag characters
(`src/assets/TwemojiCountryFlags.woff2`, used first in `--font` in `src/theme.css`). Twemoji graphics © Twitter, licensed CC-BY 4.0; font packaging by TalkJS (MIT).

## Phone

On a phone-sized screen the app shows a simpler layout: tighter spacing, tables keep only name, owner, amount and actions,
Retirement stacks as plans, results, charts, then inputs, with the detailed assumptions folded away.

## How your data is stored (Finance, Property, Portfolio and Retirement)

- Everything lives in one encrypted file (`*.wvault`), created and opened from the app. Nothing is
  sent to a server. Full account and policy numbers are stored in it.
- Encryption is AES-256-GCM with a key derived from your passphrase (PBKDF2-SHA256, 600k
  iterations). The passphrase is never stored. **If you lose it, the file cannot be recovered.**
- Chrome/Edge save straight back to the file. Other browsers open via a file picker and save by
  downloading the encrypted file.
- Settings → *Export decrypted Excel copy* writes a plain, **unencrypted** workbook
  (`Items`, `Insurance`, `Balances`, `Rates`, `Property`, `PropertyValues`, `Loans`, `LoanUpdates`, `Portfolios`, `Holdings`, `Settings` sheets). Settings → *Import from Excel*
  reads that same layout.
- The exchange rate is fetched live from the Frankfurter API (ECB rates); only the two currency
  codes are sent. The rate in use is saved with each update.
- `*.wvault`, `*.xlsx`, `*.xls` and `*.csv` are git-ignored so personal data is never committed.

## Progress

- [x] Step 1: project scaffold, grid layout, clock + greeting widget
- [x] Step 2: Finance Dashboard (encrypted file, accounts, insurance, summary, charts)
- [x] Step 3: generic country lists (1-5 per section) and the Property tab
- [x] Step 4: Portfolio tab (holdings, allocation, rebalancing), linked to Finance accounts
- [x] Step 5: Retirement tab (one page with 3 saved plans, inheritance, insurance benefit and monthly income), placeholder Google sign-in, phone layout
- [x] Step 6: demo mode (sample data, sign-in page with Demo Mode) published from the `demo` branch
- [x] Step 7: run on your own computer with `npm start`
- [x] Step 8: Home rebuild: clocks for each country, weather, markets open/closed, FCS market ticker
- [x] Step 9: Android app, first version (Capacitor; data in the app's private storage; backup/restore; Back button): tested here, **needs a first run on a device**
- [ ] Next: run it in Android Studio and fix what a device shows
- [x] Real Google sign-in (name and email only) on the web version
- [x] Optional Google Drive storage (web, Windows, Android: built, tested only with stand-ins; real-device checks pending)
- [x] Same sign-in (optional) and storage choices on every version; moving keeps the old copy until you delete it
- [ ] Then: two-step verification
