# personal-dashboard

A personal dashboard built step by step with React + Vite. Each section is a top-level tab
(add new ones in the `TABS` list in `src/App.jsx`).

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (encryption + data model)
npm run build && npm run test:e2e && npm run test:e2e:pets && npm run test:e2e:countries && npm run test:e2e:property
                     # end-to-end browser tests (need Playwright + Chromium)
```

## Tabs

- **Home** – clock and greeting.
- **Pets** – a page per pet with profile, vaccinations, medication, vet visits and weight, plus an
  overview of what is due or overdue and yearly spending. Stored in the same encrypted file as Finance.
- **Property** – properties by country with a value history you enter (USA has an "Open on Zillow" link for
  looking up the Zestimate yourself), manually recorded mortgages (balance, principal, interest, escrow),
  equity and loan-to-value, reminders for mortgage payments and property tax, and monthly charts.
  Not counted in the Finance totals. Zillow has no public API and forbids scraping, so values are typed in.
- **Finance Dashboard** – assets, liabilities and insurance for two countries (USA, India, UK,
  Australia or Switzerland; choose one to five, and Finance and Property each keep their own list), with a summary page, owner filter (Mine / Joint / Parent) and a
  month-by-month chart per country.

## How your data is stored (Finance, Pets and Property)

- Everything lives in one encrypted file (`*.wvault`), created and opened from the app. Nothing is
  sent to a server. Full account and policy numbers are stored in it.
- Encryption is AES-256-GCM with a key derived from your passphrase (PBKDF2-SHA256, 600k
  iterations). The passphrase is never stored. **If you lose it, the file cannot be recovered.**
- Chrome/Edge save straight back to the file. Other browsers open via a file picker and save by
  downloading the encrypted file.
- Settings → *Export decrypted Excel copy* writes a plain, **unencrypted** workbook
  (`Items`, `Insurance`, `Balances`, `Rates`, `Pets`, `PetRecords`, `Property`, `PropertyValues`, `Loans`, `LoanUpdates`, `Settings` sheets). Settings → *Import from Excel*
  reads that same layout.
- The exchange rate is fetched live from the Frankfurter API (ECB rates); only the two currency
  codes are sent. The rate in use is saved with each update.
- `*.wvault`, `*.xlsx`, `*.xls` and `*.csv` are git-ignored so personal data is never committed.

## Progress

- [x] Step 1: project scaffold, grid layout, clock + greeting widget
- [x] Step 2: Finance Dashboard (encrypted file, accounts, insurance, summary, charts)
- [x] Step 3: Pets tab (profiles, vaccinations, medication, visits, weight, reminders)
- [x] Step 4: generic country lists (1-5 per section) and the Property tab
- [ ] Later: Google Drive storage
