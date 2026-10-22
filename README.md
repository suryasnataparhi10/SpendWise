# SpendWise

A MERN expense tracker with JWT authentication, per user expenses, dashboard summaries, filters, and light and dark themes.

## Run locally

1. Copy `server/.env.example` to `server/.env` and set `MONGO_URI` and `JWT_SECRET`.
2. To enable password recovery and scheduled message emails, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and optionally `SMTP_FROM` in `server/.env`. Scheduled messages are sent from your SMTP account to each recipient's email address; the server checks for due messages with `node-cron` once per minute while it is running.
3. Start the API with `cd server && npm install && npm run dev`.
4. Start the frontend with `cd client && npm install && npm run dev`.

Password reset links expire after 30 minutes and can be used once. The frontend defaults to `http://localhost:5173` for reset links; set `CLIENT_URL` to the deployed frontend origin when hosting the app.

The website uses one shared API base URL from `client/src/config/api.js`. It defaults to the local URL (`http://localhost:5000/api`); set `VITE_API_TARGET=render` to use `https://spendwise-api-97wv.onrender.com/api`, or set `VITE_API_URL` to override either target. The mobile app defaults to the local API and can be configured with `EXPO_PUBLIC_API_URL`.

## Deploy to GitHub and Vercel

GitHub stores the source code. Vercel hosts the React website and Express API, while MongoDB Atlas stores the online data. The Vercel configuration is split into two projects because the client and API have separate build roots.

1. Create or select the GitHub repository for this project. `.gitignore` excludes `.env` files and dependencies; never commit API keys, SMTP credentials, or database passwords.
2. Create a MongoDB Atlas cluster and database. Add Vercel's network access as instructed by Atlas, then copy the connection string for the Vercel API environment variable `MONGO_URI`.
3. In Vercel, import the GitHub repository twice. For the website project, set **Root Directory** to `client`; Vercel will build the Vite app using `client/vercel.json` for React Router deep links.
4. For the API project, import the same repository and set **Root Directory** to `server`. Vercel detects the Express app from `server.js`; `server/vercel.json` configures the protected scheduled-job endpoint.
5. Set these API project environment variables in Vercel for Production and Preview as needed: `MONGO_URI`, a strong unique `JWT_SECRET`, the website's exact origin as `CLIENT_URL`, and a strong random `CRON_SECRET`. Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `HIDDEN_EXPENSE_RECOVERY_EMAIL` for email features.
6. If deploying a different API, set `VITE_API_URL` in the website project's environment variables to its URL followed by `/api`, then redeploy the website.
7. Add the website's Vercel domain to MongoDB Atlas network access and check that `CLIENT_URL` exactly matches the website origin (no `/api` suffix). Both projects will deploy automatically from their connected GitHub branch.

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
