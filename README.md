# K-Tix Assist — Authentication System

PHP + JSON storage · Real SMTP email · Face ID (1:1) · Strict ID validation

## Deploy on Vercel (recommended)

1. Push this repo to GitHub
2. Import the project in [vercel.com](https://vercel.com) → New Project
3. Framework Preset: **Other**
4. Deploy

### Custom domain (intern7zsa.site)

1. Vercel → Project → Settings → Domains → Add `intern7zsa.site`
2. At your DNS provider:
   - **Remove** any CNAME that points to GitHub Pages
   - Add the CNAME / A records Vercel shows you
3. Wait 1–5 minutes for DNS

### Important notes for production / custom domain

- **No demo accounts.** Users are created only through the real signup flow (government ID + face verification + email code).
- On Vercel, data & uploads use `/tmp` (ephemeral). Prefer a host with persistent storage (or a database) so accounts are not lost on cold starts.
- Use **HTTPS** so camera access works in the browser.

### SMTP

Edit `api/includes/config.php` and set your own SMTP credentials (e.g. Gmail App Password) before going live.

## Local XAMPP

1. Copy folder into `htdocs`
2. Make `data/` and `uploads/` writable
3. Open `http://localhost/your-folder/`

## Project structure

```
/
├── api/
│   ├── api.php              ← main API
│   ├── index.php            ← login page
│   ├── dashboard-*.php
│   └── includes/
│       ├── config.php       ← APP_ROOT, /tmp paths, SMTP
│       └── mailer.php
├── css/  js/  lib/  data/  uploads/
└── vercel.json
```
