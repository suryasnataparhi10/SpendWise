# SpendWise

A React expense tracker with an Express API, MongoDB storage, JWT authentication, per user expenses, dashboard summaries, filters, and light and dark themes.

The website includes bill reminders with partial-payment history and a browser-encrypted password vault. The vault uses a separate master password that is never sent to the server; forgotten master passwords cannot be recovered.

The web and mobile apps include account-synced visual themes, light/dark appearance, and custom accent colors. Web themes include Minimal Light, Dark Professional, Glassmorphism, Modern Gradient, Neumorphism, Material Design, Ocean Blue, Forest Green, Midnight AMOLED, and Colorful Creative. Profile photos accept JPG, PNG, and WebP files and are resized before being saved to the signed-in account.

## Run locally

1. Install MongoDB (or create a MongoDB Atlas cluster), copy `server/.env.example` to `server/.env`, and set `MONGODB_URI` (including the database name, for example `mongodb://127.0.0.1:27017/spendwise_app`) and `JWT_SECRET`. URL-encode special characters in the database username and password.
2. Install dependencies once with `npm install --prefix server`, `npm install --prefix client`, and `npm install --prefix mobile`.
3. Run `npm run db:setup --prefix server` to create the MongoDB collections, validation rules and indexes. The API also applies them on every start; neither ever modifies existing documents.
4. To enable password recovery and scheduled message emails, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and optionally `SMTP_FROM` in `server/.env`. Scheduled messages are sent from your SMTP account to each recipient's email address; the server checks for due messages with `node-cron` once per minute while it is running.
5. From the repository root, run `npm run dev` to start the API server, website, and Expo mobile app together. Press `Ctrl+C` to stop them.

Password reset links expire after 30 minutes and can be used once. The frontend defaults to `http://localhost:5173` for reset links; set `CLIENT_URL` to the deployed frontend origin when hosting the app.

The website backend is selected in `client/src/config/api.js`. It defaults to the local API (`http://localhost:5000/api`); set `VITE_API_TARGET=render` to use `https://spendwise-api-97wv.onrender.com/api`, or set `VITE_API_URL` to override either option. The mobile app defaults to local and accepts either backend URL through `EXPO_PUBLIC_API_URL`.

## Database

The API stores its data in MongoDB through the official Node.js driver (one shared connection pool; the driver reconnects automatically). Money is stored as `Decimal128` with two decimal places and every total is computed exactly. Each collection has a `$jsonSchema` validator and indexes that enforce the same rules as before, including unique emails and one budget per user and month.

| Collection | Contents |
| --- | --- |
| `users` | Accounts, bcrypt password hashes, hidden-expense PIN data, theme preferences |
| `expenses` | Expenses with their subtypes embedded; `deletedAt` marks items in the deleted-items bin |
| `incomes`, `budgets` | Income entries and monthly budgets |
| `reminders` | Bill reminders with their payment history embedded |
| `passwordvaults` | The browser-encrypted password vault payload (one per user) |
| `scheduledmessages`, `hiddenexpenserecoveryemails` | Scheduled emails and the PIN-recovery email queue |

On a replica set or Atlas cluster, multi-document operations run in transactions. A standalone server is also supported: payments, subtypes and reminder balances live in one document, so those updates are atomic either way.

## Migrate PostgreSQL data to MongoDB

The application previously ran on PostgreSQL. `npm run db:migrate-postgres --prefix server` copies every record into MongoDB once:

1. Set `DATABASE_URL` (the PostgreSQL source) and `MONGODB_URI` (the destination) in `server/.env`. Use a new, empty database: the script refuses to write into any non-empty SpendWise collection or into the legacy `MONGO_URI` database.
2. Optionally set `MIGRATION_EXPORT_DIR` to a secure directory outside the repository (the default is the gitignored `server/migration-data`), then run the script. It reads PostgreSQL in a single read-only snapshot and never modifies it, writes a lossless JSON export first, keeps every ID (PostgreSQL IDs are ObjectId-compatible) and password hash unchanged, and removes anything it inserted if the import fails.
3. Review `mongodb-import-report-*.json`. Proceed only when `status` is `success`: it compares record counts, IDs, every field of every record, and per-user financial totals. Then start the API and run `npm run test:api --prefix server` against a test database.

PostgreSQL is no longer needed at runtime; `pg` is a development dependency used only by the migration script. Keep the PostgreSQL database until you are confident you no longer need to roll back.

Database exports and archives contain private financial records, password hashes, and recovery tokens. Store them securely, restrict access, and never commit them to source control.

### Restore the original MongoDB backup

Create archives of a MongoDB database with `npm run db:backup-mongodb --prefix server` (it reads `MONGO_URI` and `MONGODB_BACKUP_DIR`). To inspect or recover an archive, restore it into a **separate** MongoDB database so no live collections are overwritten:

```powershell
$env:MONGODB_RESTORE_URI = "mongodb://127.0.0.1:27017/spendwise_restore"
$env:MONGODB_ARCHIVE_PATH = "C:\secure-backups\spendwise.archive.gz"
npm run db:restore-mongodb --prefix server
Remove-Item Env:\MONGODB_RESTORE_URI, Env:\MONGODB_ARCHIVE_PATH
```

Verify the restored collection counts before using that database. Never restore over the original database unless you explicitly intend to replace its data.

## Database Migration & Portability Center

Administrators can export, import and move the complete dataset from the website (**Administration → Migration center**), without database tools or a terminal. All database work runs on the server; the browser never sees connection strings.

- **Access:** set `ADMIN_EMAILS` on the server to the comma-separated emails of administrator accounts. Everyone else gets a 403 from the API and does not see the section.
- **Export:** choose a connected database (the application's MongoDB, and PostgreSQL when `DATABASE_URL` is set), enter a passphrase, and download a versioned `.swpkg.zip` package. It holds a readable `manifest.json` (source database, version, record counts) and the full dataset (accounts with password hashes, settings, every module, and the audit log) encrypted with AES-256-GCM using a key derived from the passphrase. The manifest is authenticated, so edits are detected.
- **Import:** upload a package, unlock it with its passphrase, and review a dry run (new, identical, conflicting and invalid records per data set) before anything changes. Strategies: skip duplicates, merge (package wins), resolve conflicts one by one, or replace all data. Imports that change or remove data require typing a confirmation phrase.
- **Safety:** before any import that changes or removes data, a complete backup is taken, read back and verified; restore it any time from **Backups & recovery**. Imports save checkpoints, so an interrupted import (for example after a restart) can be resumed from where it stopped. PostgreSQL imports run in one transaction. Source data is never modified.
- **History and audit:** every export, import and recovery is listed with downloadable reports; downloads, decisions, destructive confirmations, backups and denied access attempts are logged.

Migration state lives in the application database (`migrationjobs`, `migrationconflicts`, `migrationbackups`, `migrationauditlog` and the `migrationfiles` GridFS bucket), encrypted with `MIGRATION_ENCRYPTION_KEY`. Keep that key stable, because backups cannot be decrypted without it. Packages up to `MIGRATION_MAX_UPLOAD_MB` (default 200) are accepted and processed in memory. Test the feature against a disposable database with `npm run test:migration-center --prefix server` (see the script header).

## Deploy API and client

GitHub stores the source code. Deploy the Express API with the included Render configuration or another Node.js host, and deploy the React website separately. MongoDB must be reachable from the API host (for Atlas, allow the host's outbound IP addresses in Network Access).

1. Create or select the GitHub repository for this project. `.gitignore` excludes `.env` files and dependencies; never commit API keys, SMTP credentials, or database passwords.
2. Create a MongoDB database (for example on MongoDB Atlas) and a database user limited to that database. Configure the API host's `MONGODB_URI` as a secret environment variable; do not commit credentials.
3. Deploy the API from the repository's `server` directory. Run `npm run db:setup` during initial provisioning and set `JWT_SECRET`, the website's exact origin as `CLIENT_URL`, `ADMIN_EMAILS` and a long random `MIGRATION_ENCRYPTION_KEY` for the migration center, and, when using a scheduled-job provider, a strong random `CRON_SECRET`. Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `HIDDEN_EXPENSE_RECOVERY_EMAIL` for email features.
4. Deploy the website from the `client` directory and set `VITE_API_URL` to the API URL followed by `/api`. The mobile app uses `EXPO_PUBLIC_API_URL`.
5. If deploying to Vercel, use the included `server/vercel.json` scheduled-job endpoint configuration and set the same MongoDB and API environment variables in the server project. The website project remains rooted at `client`.

The included Vercel Cron runs scheduled reminders and queued recovery emails daily so it can deploy on Vercel Hobby. Hobby schedules have daily precision, so reminders may arrive late. For minute-accurate reminders, use a Vercel plan that supports per-minute cron runs and change the schedule in `server/vercel.json` to `* * * * *`, or use a separate scheduled-job provider. Cron requests are protected by `CRON_SECRET`.

## Android and iOS app

The Expo React Native app lives in `mobile/` and connects to the same API. Set `EXPO_PUBLIC_API_URL` to the deployed API URL, then use Expo Go for development or EAS Build for an installable Android package. See `mobile/README.md` for setup and build instructions. Expo documents creating projects with [`create-expo-app`](https://docs.expo.dev/get-started/create-a-project/) and [internal Android/iOS builds](https://docs.expo.dev/build/internal-distribution/).

## Formatting

Run `npm run format` from `client` to format the frontend and backend JavaScript and CSS with the shared Prettier configuration. Run `npm run format:check` to check formatting.

## API

- `POST /api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`
- `GET /api/auth/me`
- `GET` and `POST /api/expenses`
- `POST /api/expenses/bulk`
- `GET`, `PUT`, and `DELETE /api/expenses/:id`
- `GET /api/expenses/yearly?year=`
- `GET /api/dashboard/summary?month=&year=`
