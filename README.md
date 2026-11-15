# personal-dashboard

A personal dashboard built step by step with React + Vite. Each section is a top-level tab
(add new ones in the `TABS` list in `src/App.jsx`).

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (encryption + data model)
npm run build && npm run test:e2e && npm run test:e2e:countries && npm run test:e2e:property && npm run test:e2e:portfolio && npm run test:e2e:retirement && npm run test:e2e:auth
                     # end-to-end browser tests (need Playwright + Chromium)
```

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs the unit tests, builds, and publishes `dist/` whenever `main` changes. One-time setup:
repository **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site is then at
`https://<user>.github.io/<repo>/`. Assets use relative paths (`base: './'`), so the same build works at any sub-path
and inside an Android wrapper. This address is what each person adds as an "Authorized JavaScript origin"
(just the origin, e.g. `https://<user>.github.io`, without the path) in their Google Cloud project.

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
| **Demo** | `demo`, updated from `main`, on GitHub Pages | sample data in `demo/demo-data.json`; nothing saved, no sign-in |
| **Android** | `main`, on a release tag | an encrypted file in app storage, or your Google Drive |

- New work starts from `main` on its own branch and returns by pull request. Code flows **one way** into `demo`, never back.
- Demo mode, local storage and Google Drive are settings inside `main`, not separate copies of the app.
- Google sign-in on Android uses a client ID registered for the Android app, different from the web one; this is decided when
  the Android app is built.

A picture version of this, which also ships with the site, is in
[`public/docs/branch-flow.html`](public/docs/branch-flow.html) (served at `/docs/branch-flow.html`).

## Tabs

- **Home** – clock and greeting.
- **Retirement** – *Plan*: your situation, savings picked from Finance asset accounts (converted to the plan
  currency, equity share taken from the Portfolio mix), income sources with start and end ages, market conditions with a
  staleness warning, nest-egg needed, shortfall and extra saving, and a yield sensitivity table. *Monte Carlo*: 1,000 to 10,000
  random futures in today's money (lognormal real returns per asset class, correlated, rebalanced yearly): chance
  your savings last, spread of outcomes (**Projected Net Worth**), chance by age, when money runs out, the spending
  that still meets a target chance, an optional flexible-spending rule, and up to **3 saved versions** you can load,
  overwrite, rename, delete and compare. The starting return, volatility and correlation figures are **placeholders,
  not forecasts**; edit them. A version stores its inputs and seed, and results are recalculated on load.
  Engine: `src/lib/montecarlo.js`; plan and versions: `src/lib/retirement.js`. Not included in the Excel export.
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

## Sign-in (placeholder)

The app opens on a **Sign in with Google** screen. The button is a dummy: it is not connected to Google, signs you in as a demo
user and sends nothing anywhere. A two-step (MFA) screen is built into the flow (`src/lib/auth.js`, `src/auth/`) but not
enforced: turn on the preview from the Account dialog to see it; any 6-digit code passes. Real Google sign-in, real
verification and storing the data file in Google Drive are the next steps. Until then the encrypted file and its passphrase
are unchanged.

## Google setup (first run)

Everyone uses their **own** Google client ID, so the first screen asks for it (with a 6-step guide, the address to authorise,
and a refusal to accept a client *secret*, which the app never needs). It is saved in the browser only, can be changed from
the Account dialog, and can be skipped to use the demo sign-in. Real sign-in with it is still on hold.

## Phone

On a phone-sized screen the app shows a simpler layout: tighter spacing, tables keep only name, owner, amount and actions,
Retirement shows the key results and two charts with the detailed assumptions folded away.

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
- [x] Step 5: Retirement tab (Plan + Monte Carlo with 3 saved versions), placeholder Google sign-in, phone layout
- [ ] Next: demo mode + `demo` branch on GitHub Pages, local-run polish (`npm start`), Android app (Capacitor)
- [ ] Then: real Google sign-in, two-step verification, Google Drive storage (web and Android)
