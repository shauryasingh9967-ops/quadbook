# Setup Guide (Windows 10/11 + VS Code)

## 1. Install the tools (once)

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS or newer | https://nodejs.org (includes npm). Check: `node -v` |
| MySQL Community Server | 8.0 or newer | Remember the root password you set. Check: `mysql --version` |
| MongoDB Community Server | 6.0 or newer | Install as a Windows service so it starts automatically |
| VS Code | any | Optional extensions: ESLint, Tailwind CSS IntelliSense |

Make sure both database services are running (Win+R, `services.msc`, look for **MySQL80** and **MongoDB**).

## 2. Open the project

Unzip `Smart-Campus-Complete-Project.zip`, open the `smart-campus` folder in VS Code and open two terminals (Ctrl+Shift+`).

## 3. Backend (terminal 1)

```powershell
cd backend
copy .env.example .env
notepad .env
```

Edit these values in `.env`:

* `DB_USER` / `DB_PASSWORD`: your MySQL login (root is fine for local use).
* `JWT_SECRET`: any random string of 32+ characters. Generate one with
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
* `MONGO_URI`: leave the default unless MongoDB runs elsewhere.

Then:

```powershell
npm install
npm run db:reset
npm run dev
```

`db:reset` drops and recreates the `smart_campus` database, applies the 7 migrations and loads the seed data (131 users, 36 resources, 1,700 bookings and more) plus the MongoDB logs. Expected output ends with `QuadBook API listening on http://localhost:4000/api`.

Check it: open http://localhost:4000/api/public/overview in a browser. You should see JSON.

## 4. Frontend (terminal 2)

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` to port 4000, so no CORS setup is needed locally.

## 5. Sign in

Use the demo buttons on the login page, or the credentials in the root README.

## 6. Run the tests (optional)

```powershell
cd backend
npm test
```

The tests use a separate `smart_campus_test` database and `smart_campus_test_logs` in MongoDB (created automatically). Your demo data is not touched. The DB user needs permission to create databases.

## 7. Production build (optional)

```powershell
cd backend ; npm run build ; npm start
cd ..\frontend ; npm run build      # serve the dist folder with any static server and proxy /api to the backend
```

Set `NODE_ENV=production`, a strong `JWT_SECRET`, and list your real frontend origin in `CORS_ORIGINS`.

## Loading the database without Node

```powershell
mysql -u root -p -e "CREATE DATABASE smart_campus CHARACTER SET utf8mb4"
mysql -u root -p smart_campus < database\schema\smart_campus_schema.sql
mysql -u root -p smart_campus < database\seeds\smart_campus_seed_data.sql
```

The SQL seed has fixed dates. `npm run db:reset` regenerates dates relative to today, so prefer it for demos. MongoDB logs are only created by the Node seeder.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Access denied for user` | Wrong `DB_USER` / `DB_PASSWORD` in `backend/.env` |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL service is not running |
| Audit logs page says "Audit store is offline" | MongoDB is not running. The rest of the app keeps working; start MongoDB and the API reconnects within 10 seconds |
| `Invalid environment configuration` at start | `JWT_SECRET` is missing or shorter than 32 characters |
| Port 4000 or 5173 busy | Change `PORT` in `.env` (and `VITE_PROXY_TARGET` in `frontend/.env`) or stop the other program |
| Login says too many attempts | The auth rate limit (30 per 15 minutes per IP) was hit; wait or raise `AUTH_RATE_LIMIT_MAX` |
| Times look shifted by hours | MySQL, Node and the browser must use the same time zone |
