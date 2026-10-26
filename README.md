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

### Important notes for Vercel

- Data & uploads are stored in `/tmp` (ephemeral). Users are re-seeded on cold start if the JSON is missing.
- Demo accounts (always available after seed):
  | Role  | Email          | Password  |
  |-------|----------------|-----------|
  | Admin | admin@ktix.com | Admin@123 |
  | Staff | staff@ktix.com | Staff@123 |

### SMTP (already configured)

Edit `api/includes/config.php` if you need to change Gmail App Password.

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
