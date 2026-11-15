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
  (`Items`, `Insurance`, `Balances`, `Rates`, `Pets`, `PetRecords` (legacy, see below), `Property`, `PropertyValues`, `Loans`, `LoanUpdates`, `Portfolios`, `Holdings`, `Settings` sheets). Settings → *Import from Excel*
  reads that same layout.
- The exchange rate is fetched live from the Frankfurter API (ECB rates); only the two currency
  codes are sent. The rate in use is saved with each update.
- `*.wvault`, `*.xlsx`, `*.xls` and `*.csv` are git-ignored so personal data is never committed.

## Progress

- [x] Step 1: project scaffold, grid layout, clock + greeting widget
- [x] Step 2: Finance Dashboard (encrypted file, accounts, insurance, summary, charts)
- [x] Step 3: Pets tab (later retired, see below)
- [x] Step 4: generic country lists (1-5 per section) and the Property tab
- [x] Step 5: Portfolio tab (holdings, allocation, rebalancing), linked to Finance accounts
- [x] Step 6: Retirement tab (Plan + Monte Carlo with 3 saved versions), placeholder Google sign-in, phone layout
- [ ] Next: real Google sign-in, two-step verification, Google Drive storage

## Retired: Pets tab

The Pets tab (profiles, vaccinations, medication, vet visits, weight, reminders) was removed from the app because it
did not fit a finance dashboard. The complete working code, with its tests and mockup, is kept on the protected
branch **`archive/pets-tab`** (a snapshot of `main` before removal). To bring it back, restore `src/pets/`,
`src/lib/pets.js` and the tab entry in `src/App.jsx` from that branch.

Pet data already saved in an encrypted file or Excel backup is kept untouched (just not shown), so restoring the tab
shows it again.
