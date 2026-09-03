<?php
/**
 * Rene Coffee / Coffee Blend – Server Config
 * ------------------------------------------------
 * IMPORTANT SECURITY:
 * 1. Never commit real secret keys to GitHub.
 * 2. On GoDaddy, edit this file ONLY on the server (or use env vars).
 * 3. If a live key was ever committed, ROTATE it in PayMongo dashboard.
 */
// Prefer environment variables (recommended for production)
$PAYMONGO_SECRET_KEY = getenv('PAYMONGO_SECRET_KEY') ?: 'sk_live_cPt11pVLZnJEsesJgsKsczEH';
$PAYMONGO_PUBLIC_KEY = getenv('PAYMONGO_PUBLIC_KEY') ?: 'pk_live_YLthZX1JzsCm9MWsfa5xW6YU';
// Webhook secret from PayMongo Dashboard → Developers → Webhooks (optional but recommended)
$PAYMONGO_WEBHOOK_SECRET = getenv('PAYMONGO_WEBHOOK_SECRET') ?: '';
// Your live site URL (GoDaddy domain)
$SITE_URL = 'https://intern7zsa.site';
// Allowed origins for CORS (comma-separated). Use * only for local testing.
$ALLOWED_ORIGINS = getenv('ALLOWED_ORIGINS') ?: '*';
// Minimum amount in centavos (₱1.00 = 100)
$MIN_AMOUNT_CENTAVOS = 100;
// ---------- Sales notification ----------
$OWNER_EMAIL    = getenv('OWNER_EMAIL') ?: 'markcyrilpenafiel@gmail.com';
$MAIL_FROM = getenv('MAIL_FROM') ?: 'markcyrilpenafiel@gmail.com';
$MAIL_FROM_NAME = getenv('MAIL_FROM_NAME') ?: 'Rene Coffee Store';
// Gmail SMTP (recommended). Create an App Password:
// Google Account → Security → 2-Step Verification → App passwords
$SMTP_ENABLED = filter_var(getenv('SMTP_ENABLED') ?: 'true', FILTER_VALIDATE_BOOLEAN);
$SMTP_HOST    = getenv('SMTP_HOST') ?: 'smtp.gmail.com';
$SMTP_PORT    = (int)(getenv('SMTP_PORT') ?: 587);
$SMTP_USER    = getenv('SMTP_USER') ?: 'markcyrilpenafiel@gmail.com';           // your full Gmail address
$SMTP_PASS    = getenv('SMTP_PASS') ?: '@Deathtstalker26';           // 16-char App Password (not normal password)
$SMTP_SECURE  = getenv('SMTP_SECURE') ?: 'tls';      // tls | ssl
// Order log directory (JSON files; blocked by .htaccess)
$ORDERS_DIR = __DIR__ . '/orders';

function paymongo_headers($secretKey) {
    return [
        'Content-Type: application/json',
        'Authorization: Basic ' . base64_encode($secretKey . ':')
    ];
}

function json_response($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function apply_cors($allowedOrigins) {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($allowedOrigins === '*') {
        header('Access-Control-Allow-Origin: *');
    } elseif ($origin && in_array($origin, array_map('trim', explode(',', $allowedOrigins)), true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

function ensure_orders_dirs() {
    global $ORDERS_DIR;
    foreach ([$ORDERS_DIR, $ORDERS_DIR . '/pending', $ORDERS_DIR . '/paid'] as $d) {
        if (!is_dir($d)) {
            @mkdir($d, 0750, true);
        }
    }
}

function save_pending_order($paymentIntentId, array $order) {
    ensure_orders_dirs();
    global $ORDERS_DIR;
    $order['payment_intent_id'] = $paymentIntentId;
    $order['saved_at'] = date('c');
    $path = $ORDERS_DIR . '/pending/' . preg_replace('/[^a-zA-Z0-9_\-]/', '', $paymentIntentId) . '.json';
    return (bool)@file_put_contents($path, json_encode($order, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function load_pending_order($paymentIntentId) {
    global $ORDERS_DIR;
    $path = $ORDERS_DIR . '/pending/' . preg_replace('/[^a-zA-Z0-9_\-]/', '', $paymentIntentId) . '.json';
    if (!is_file($path)) return null;
    $data = json_decode(@file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

function mark_order_paid($paymentIntentId, array $extra = []) {
    ensure_orders_dirs();
    global $ORDERS_DIR;
    $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '', $paymentIntentId);
    $pendingPath = $ORDERS_DIR . '/pending/' . $safe . '.json';
    $paidPath    = $ORDERS_DIR . '/paid/' . $safe . '.json';
    $order = is_file($pendingPath)
        ? (json_decode(@file_get_contents($pendingPath), true) ?: [])
        : ['payment_intent_id' => $paymentIntentId];
    $order = array_merge($order, $extra);
    $order['paid_at'] = date('c');
    $order['status']  = 'paid';
    @file_put_contents($paidPath, json_encode($order, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    if (is_file($pendingPath)) {
        @unlink($pendingPath);
    }
    return $order;
}

function order_already_paid($paymentIntentId) {
    global $ORDERS_DIR;
    $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '', $paymentIntentId);
    return is_file($ORDERS_DIR . '/paid/' . $safe . '.json');
}

/**
 * Send HTML email: tries Gmail SMTP first (if configured), else PHP mail().
 */
function send_sale_notification($to, $subject, $htmlBody, $fromEmail = null, $fromName = null) {
    global $OWNER_EMAIL, $MAIL_FROM, $MAIL_FROM_NAME;
    global $SMTP_ENABLED, $SMTP_HOST, $SMTP_PORT, $SMTP_USER, $SMTP_PASS, $SMTP_SECURE;
    $to = $to ?: $OWNER_EMAIL;
    $fromEmail = $fromEmail ?: $MAIL_FROM;
    $fromName  = $fromName ?: $MAIL_FROM_NAME;
    if (!$to || strpos($to, 'your-gmail') !== false) {
        return false;
    }
    // 1) SMTP (Gmail App Password)
    if ($SMTP_ENABLED && $SMTP_USER && $SMTP_PASS) {
        require_once __DIR__ . '/lib/smtp_mailer.php';
        $mailer = new SmtpMailer($SMTP_HOST, $SMTP_PORT, $SMTP_USER, $SMTP_PASS, $SMTP_SECURE);
        $ok = $mailer->send($fromEmail, $fromName, $to, $subject, $htmlBody);
        if ($ok) return true;
        // fall through to mail() if SMTP fails
        error_log('[ReneCoffee] SMTP failed: ' . $mailer->getLastError());
    }
    // 2) Fallback PHP mail()
    $headers = [];
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Content-type: text/html; charset=UTF-8';
    $headers[] = 'From: ' . $fromName . ' <' . $fromEmail . '>';
    $headers[] = 'Reply-To: ' . $fromEmail;
    $headers[] = 'X-Mailer: PHP/' . phpversion();
    return @mail($to, $subject, $htmlBody, implode("\r\n", $headers));
}

function build_sale_email_html(array $order) {
    $name   = htmlspecialchars($order['name'] ?? 'Customer');
    $email  = htmlspecialchars($order['email'] ?? '');
    $phone  = htmlspecialchars($order['phone'] ?? '');
    $amount = htmlspecialchars((string)($order['amount_display'] ?? $order['amount'] ?? ''));
    $ref    = htmlspecialchars($order['order_ref'] ?? '');
    $pi     = htmlspecialchars($order['payment_intent_id'] ?? '');
    $qty    = htmlspecialchars((string)($order['quantity'] ?? ''));
    $src    = htmlspecialchars($order['notify_source'] ?? 'system');
    return '
<html><body style="font-family:Arial,sans-serif;background:#111;color:#eee;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:28px;">
    <h2 style="color:#c49b63;margin-top:0;">New sale received</h2>
    <p style="color:#ccc;">A customer completed a QR Ph payment on your store.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr><td style="padding:8px 0;color:#888;">Customer</td><td style="padding:8px 0;color:#fff;"><strong>' . $name . '</strong></td></tr>
      <tr><td style="padding:8px 0;color:#888;">Email</td><td style="padding:8px 0;color:#fff;">' . $email . '</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Phone</td><td style="padding:8px 0;color:#fff;">' . $phone . '</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Quantity</td><td style="padding:8px 0;color:#fff;">' . $qty . '</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Amount</td><td style="padding:8px 0;color:#c49b63;font-size:18px;"><strong>₱' . $amount . '</strong></td></tr>
      <tr><td style="padding:8px 0;color:#888;">Order ref</td><td style="padding:8px 0;color:#fff;">' . $ref . '</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Payment intent</td><td style="padding:8px 0;color:#aaa;font-size:12px;">' . $pi . '</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Source</td><td style="padding:8px 0;color:#aaa;font-size:12px;">' . $src . '</td></tr>
    </table>
    <p style="color:#666;font-size:12px;margin-bottom:0;">Rene Coffee · automatic sales notification</p>
  </div>
</body></html>';
}

/**
 * Build a friendly thank-you email for the customer.
 */
function build_customer_thankyou_email_html(array $order) {
    $name   = htmlspecialchars($order['name'] ?? 'Valued Customer');
    $amount = htmlspecialchars((string)($order['amount_display'] ?? $order['amount'] ?? ''));
    $ref    = htmlspecialchars($order['order_ref'] ?? '');
    $qty    = htmlspecialchars((string)($order['quantity'] ?? '1'));

    return '
<html><body style="font-family:Arial,sans-serif;background:#111;color:#eee;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:28px;">
    <h2 style="color:#c49b63;margin-top:0;">Thank you for your purchase!</h2>
    <p style="color:#ccc;line-height:1.5;">
      Hi <strong>' . $name . '</strong>,<br><br>
      We truly appreciate you choosing <strong>Rene Coffee</strong>.  
      Your order has been successfully received and is being prepared with care.
    </p>

    <table style="width:100%;border-collapse:collapse;margin:24px 0;">
      <tr><td style="padding:8px 0;color:#888;">Order Reference</td><td style="padding:8px 0;color:#fff;"><strong>' . $ref . '</strong></td></tr>
      <tr><td style="padding:8px 0;color:#888;">Quantity</td><td style="padding:8px 0;color:#fff;">' . $qty . '</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Total Amount</td><td style="padding:8px 0;color:#c49b63;font-size:18px;"><strong>₱' . $amount . '</strong></td></tr>
    </table>

    <p style="color:#ccc;line-height:1.5;">
      We will process your order shortly. If you have any questions, simply reply to this email.
    </p>

    <p style="color:#c49b63;margin-top:28px;font-weight:bold;">
      Enjoy your coffee! ☕
    </p>

    <p style="color:#666;font-size:12px;margin-bottom:0;margin-top:32px;">
      Rene Coffee · Thank you for supporting a local coffee brand
    </p>
  </div>
</body></html>';
}

/**
 * Send thank-you email to the customer (if they provided an email).
 * Call this after mark_order_paid() succeeds.
 */
function send_customer_thankyou(array $order) {
    $customerEmail = trim($order['email'] ?? '');
    if (!$customerEmail || !filter_var($customerEmail, FILTER_VALIDATE_EMAIL)) {
        return false; // no valid email
    }

    $subject = 'Thank you for your order – Rene Coffee';
    $htmlBody = build_customer_thankyou_email_html($order);

    return send_sale_notification(
        $customerEmail,          // send to customer
        $subject,
        $htmlBody
    );
}
