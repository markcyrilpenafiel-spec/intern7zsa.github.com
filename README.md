# Rene Coffee (Coffee Blend) – Enhanced Store

Functional coffee shop site with:

- **Firebase Auth** – Login / Sign up / Forgot password  
- **PayMongo** – Real payments via **QR Ph** (GCash, Maya, banks)  
- **All products ₱1.00** – ideal for live testing  
- Ready for **GitHub** + **GoDaddy** hosting  

---

## ⚠️ SECURITY – Do this first

A **live PayMongo secret key** was previously hardcoded in `create-checkout.php`.  
**Rotate/revoke that key immediately** in the [PayMongo Dashboard](https://dashboard.paymongo.com/) → Developers → API Keys, then put the **new** key only on the server (see below). Never commit live `sk_live_...` keys to GitHub.

---

## 1. Firebase setup

1. Open [Firebase Console](https://console.firebase.google.com) → create a project.  
2. **Authentication** → Sign-in method → enable **Email/Password**.  
3. Project settings → **Your apps** → Web → copy the config object.  
4. Edit `js/firebase-config.js`:

```js
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
window.FIREBASE_ENABLED = true;
```

5. (Optional) Authorized domains: add your GoDaddy domain (e.g. `yourdomain.com`).

Pages:

| Page | Purpose |
|------|---------|
| `login.html` | Sign in |
| `signup.html` | Register + verification email |
| `forgot-password.html` | Password reset email |

Checkout requires login when `FIREBASE_ENABLED` is `true`.

---

## 2. PayMongo setup (QR Ph)

1. [PayMongo Dashboard](https://dashboard.paymongo.com/) → activate **QR Ph** (and optionally GCash / Maya / Cards).  
2. Copy **Secret key** (`sk_test_...` or `sk_live_...`).  
3. On the **server only**, edit `config.php` **or** set environment variables:

```php
$PAYMONGO_SECRET_KEY = 'sk_live_xxxxxxxx';  // server only
$SITE_URL = 'https://yourdomain.com';
```

Or on GoDaddy (when supported):

```
PAYMONGO_SECRET_KEY=sk_live_...
SITE_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com
```

### Checkout flow (QR)

1. Customer adds items (₱1 each) → Cart → Checkout.  
2. Fills billing → **Generate QR & Pay**.  
3. `create-qrph.php` creates Payment Intent → Payment Method (`qrph`) → Attach → returns **QR image URL**.  
4. `orderConfirmation.html` shows QR; user scans with GCash/Maya/bank.  
5. **I Already Paid – Check Status** calls `check-payment.php` → if `succeeded`, redirect to `Success.html` and clear cart.

Endpoints:

| File | Role |
|------|------|
| `create-qrph.php` | Generate QR Ph payment |
| `create-checkout.php` | Full PayMongo Checkout Session (card/GCash/Maya/QR) |
| `check-payment.php` | Poll payment intent status |
| `config.php` | Keys & CORS |

PHP needs **cURL** enabled (default on most GoDaddy Linux plans).

---

## 3. GitHub

```bash
cd "Rene Coffee"
git init
# Add a .gitignore that excludes secrets
git add .
git commit -m "Rene Coffee store with Firebase Auth + PayMongo QR"
git branch -M main
git remote add origin https://github.com/YOUR_USER/rene-coffee.git
git push -u origin main
```

**Never** push real `sk_live_` keys. Keep production keys only on GoDaddy.

Suggested `.gitignore`:

```
config.local.php
.env
*.log
```

---

## 4. GoDaddy deployment

1. Buy/point domain (A record / nameservers) to your hosting.  
2. File Manager or FTP → upload all files into `public_html` (or a subfolder).  
3. Ensure PHP 7.4+ and **curl** extension.  
4. Edit `config.php` on the server with live PayMongo key + `SITE_URL`.  
5. In Firebase → Authentication → Authorized domains → add your domain.  
6. Test: open `https://yourdomain.com/menu.html` → add to cart → login → checkout → QR.

Local test (no PHP payments):

```bash
# Static only
npx serve .
# Or with PHP (for QR API)
php -S localhost:8000
```

---

## 5. Product prices

All catalog prices are set to **₱1.00** (menu, shop, product pages, cart defaults) so you can run real PayMongo charges cheaply while testing.

To change later, update HTML prices and `js/cart.js` → `UNIT_PRICE`.

---

## 6. Pages overview

| File | Description |
|------|-------------|
| `index.html` | Home |
| `menu.html` / `shop.html` | Catalog (Add to cart → ₱1) |
| `cart.html` | Cart (localStorage) |
| `checkout.html` | Billing + Generate QR |
| `orderConfirmation.html` | QR display + status check |
| `Success.html` | Thank you |
| `login.html` / `signup.html` / `forgot-password.html` | Auth |

---

## 7. Quick checklist

- [ ] Rotate any leaked PayMongo live key  
- [ ] Paste Firebase config + `FIREBASE_ENABLED = true`  
- [ ] Set `PAYMONGO_SECRET_KEY` + `SITE_URL` on server  
- [ ] Enable QR Ph in PayMongo  
- [ ] Upload to GoDaddy, enable PHP/cURL  
- [ ] Add domain to Firebase authorized domains  
- [ ] Test ₱1 QR payment end-to-end  

---

Template base: Colorlib Coffee (CC BY 3.0). Keep footer credit when required.

---

## 8. Email verification (signup) & forgot password

Already built in:

| Feature | How it works |
|---------|----------------|
| **Signup verification** | After Sign Up, Firebase sends a verification email. User must open the link. |
| **Resend verification** | After login (if unverified) or from the account dropdown → "Resend verification email". |
| **Forgot password** | `forgot-password.html` → Firebase sends a reset link to the user's inbox. |

### Firebase Console checklist

1. Authentication → Sign-in method → **Email/Password** = Enabled  
2. Authentication → Templates (optional) → customize the **Email address verification** and **Password reset** messages  
3. Project settings → Authorized domains → add your GoDaddy domain  

Verification and reset emails are sent **by Firebase** (not from your Gmail). They appear from an address like `noreply@your-project.firebaseapp.com` unless you set up a custom SMTP in Firebase (Blaze plan / advanced).

---

## 9. Gmail notification for sales (owner alert)

When a customer clicks **I Already Paid** and PayMongo confirms `succeeded`, the site calls `notify-sale.php`, which emails **you**.

### Setup on GoDaddy

1. Edit `config.php` **on the server** (do not commit real addresses to GitHub if you prefer):

```php
$OWNER_EMAIL = 'your-gmail@gmail.com';   // where sales alerts go
$MAIL_FROM   = 'your-gmail@gmail.com';   // or noreply@yourdomain.com
$MAIL_FROM_NAME = 'Rene Coffee Store';
```

2. Or set environment variables if your host supports them:
   - `OWNER_EMAIL`
   - `MAIL_FROM`
   - `MAIL_FROM_NAME`

3. Make a real ₱1 test payment and click **I Already Paid**. You should receive an HTML email with customer name, email, phone, amount, and order ref.

### If emails do not arrive

- Check **Spam / Promotions** in Gmail.  
- On GoDaddy, ensure the hosting plan allows PHP `mail()`.  
- For more reliable delivery, use **Gmail SMTP + PHPMailer** (recommended for production):

1. Google Account → Security → enable **2-Step Verification** → create an **App password**.  
2. Install PHPMailer on the server (or upload the library).  
3. Replace `send_sale_notification()` in `config.php` with SMTP code using:
   - Host: `smtp.gmail.com`
   - Port: `587`
   - Username: your Gmail
   - Password: the 16-character App password  

Ask if you want a ready-made PHPMailer version of `notify-sale.php`.

---

## 10. Updated checklist

- [ ] Firebase: Email/Password enabled  
- [ ] Paste config into `js/firebase-config.js` + `FIREBASE_ENABLED = true`  
- [ ] Test Sign Up → verification email arrives  
- [ ] Test Forgot password → reset email arrives  
- [ ] Set `$OWNER_EMAIL` in server `config.php`  
- [ ] Upload `notify-sale.php` + updated files to GoDaddy  
- [ ] Test ₱1 QR payment → owner receives sales email

---

## 11. PayMongo webhook (recommended – reliable sales email)

The browser “I Already Paid” button is a **fallback**. The webhook emails you even if the customer never clicks it.

### Setup

1. Deploy `webhook.php` to your live site (HTTPS required).
2. PayMongo Dashboard → **Developers → Webhooks → Add endpoint**
   - **URL:** `https://yourdomain.com/webhook.php`  
     (optional extra protection: `https://yourdomain.com/webhook.php?key=SOME_LONG_SECRET` and set env `WEBHOOK_URL_KEY`)
   - **Events:** `payment.paid` (add `payment.failed` if you want)
3. Save. PayMongo will POST to your server when a QR payment completes.

### What the webhook does

1. Receives `payment.paid`
2. Loads the pending order (saved when QR was created) from `orders/pending/`
3. Moves it to `orders/paid/` (JSON log – blocked from public web by `.htaccess`)
4. Emails `$OWNER_EMAIL` via SMTP (or PHP `mail()` fallback)
5. Skips duplicate emails if the same payment was already recorded

### Test

- Make a real/test ₱1 QR payment
- Do **not** click “I Already Paid”
- You should still get the sales email within a few seconds
- Check `orders/paid/` on the server for the JSON file

---

## 12. Gmail SMTP (App Password) – reliable delivery

PHP `mail()` on shared hosting often goes to spam. Use Gmail SMTP:

1. Google Account → **Security** → enable **2-Step Verification**
2. **App passwords** → generate one for “Mail”
3. On the server, set in `config.php` (or env vars):

```php
$OWNER_EMAIL = 'your-gmail@gmail.com';
$MAIL_FROM   = 'your-gmail@gmail.com';
$MAIL_FROM_NAME = 'Rene Coffee Store';

$SMTP_ENABLED = true;
$SMTP_HOST    = 'smtp.gmail.com';
$SMTP_PORT    = 587;
$SMTP_USER    = 'your-gmail@gmail.com';
$SMTP_PASS    = 'xxxx xxxx xxxx xxxx';  // 16-char App Password
$SMTP_SECURE  = 'tls';
```

4. Upload `lib/smtp_mailer.php` and updated `config.php`
5. Test with a payment or by temporarily calling `notify-sale.php`

No Composer / PHPMailer install needed – a small pure-PHP SMTP client is included in `lib/smtp_mailer.php`.

---

## 13. Order log files

| Path | Purpose |
|------|---------|
| `orders/pending/{pi_xxx}.json` | Created when QR is generated |
| `orders/paid/{pi_xxx}.json` | After webhook or browser confirm |
| `orders/.htaccess` | Denies public HTTP access |

Keep periodic backups of the `orders/` folder.
