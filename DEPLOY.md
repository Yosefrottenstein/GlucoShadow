# Hosting GlucoShadow yourself

0. Note: the repo .gitignore hides .env.example files, so add them with `git add -f`.
1. Get a small Linux server (VPS, 2 GB RAM recommended) and a domain name pointing to its IP (A record).
2. Install Docker + Docker Compose on the server and copy this repository there.
3. `cp .env.example .env` and set DOMAIN to your domain.
4. `cp backend/.env.example backend/.env`, then set JWT_SECRET (`openssl rand -hex 32`) and any Twilio values.
5. `docker compose up -d --build`
6. Check: open https://YOUR-DOMAIN/api/auth/ in a browser. Any reply from the server (even "Not Found" or "Not authenticated") means it is running. The first start may take a minute while HTTPS is issued.
7. Logs: `docker compose logs -f backend`. Backups: `docker compose exec mongo mongodump --archive > backup.archive`.

App side: set `EXPO_PUBLIC_BACKEND_URL=https://YOUR-DOMAIN` in `frontend/.env`, then rebuild the Android app.
Keep the server always on: it runs the background loop that fetches readings and fires alarms.

## Password-reset emails (use a mailbox you already have, no new account)
Example with Gmail:
1. In your Google account turn on 2-Step Verification (Security settings).
2. Open https://myaccount.google.com/apppasswords, create an app password (name it GlucoShadow) and copy the 16 characters.
3. In `backend/.env` set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=you@gmail.com`, `SMTP_PASSWORD=<the app password>`.
4. `docker compose up -d --build backend`, then try "Forgot password" in the app.
Codes are sent from that Gmail address. Other mailboxes work the same way with their own SMTP host and port.
Optional: if you ever want a dedicated sender, fill `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` instead and leave `SMTP_HOST` empty.

## AI daily summary (Anthropic)
1. Create an API key at console.anthropic.com (API Keys) and add a small amount of credit under Billing.
2. Put it in `backend/.env` as `ANTHROPIC_API_KEY`. Optionally set `ANTHROPIC_MODEL` (default `claude-haiku-5-5`, the cheapest).
3. `docker compose up -d --build backend`. Until a key is set, the summary card shows "AI summary is not set up on this server."
