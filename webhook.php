<?php
/**
 * PayMongo webhook endpoint
 * ------------------------
 * Register in PayMongo Dashboard → Developers → Webhooks:
 *   URL:    https://yourdomain.com/webhook.php
 *   Events: payment.paid  (and optionally payment.failed)
 *
 * When payment succeeds, this script:
 *  1. Logs the order under orders/paid/
 *  2. Emails the shop owner (SMTP / mail)
 *
 * Does NOT depend on the customer clicking "I Already Paid".
 */
require_once __DIR__ . '/config.php';

// Webhooks are server-to-server – no CORS needed
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!$payload || !isset($payload['data'])) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid payload']);
    exit;
}

// Optional: basic shared-secret check via query string if you set
// webhook URL to https://yourdomain.com/webhook.php?key=YOUR_SECRET
// (PayMongo does not always send a signature header the same way as Stripe.)
$expectedKey = getenv('WEBHOOK_URL_KEY') ?: '';
if ($expectedKey !== '') {
    $got = $_GET['key'] ?? '';
    if (!hash_equals($expectedKey, $got)) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
}

$eventType = $payload['data']['attributes']['type']
    ?? $payload['data']['attributes']['event']
    ?? '';

// Nested resource
$resource = $payload['data']['attributes']['data'] ?? $payload['data'] ?? [];
$resourceId = $resource['id'] ?? '';
$attrs = $resource['attributes'] ?? [];

// Accept payment.paid and payment_intent.succeeded
$isPaidEvent = in_array($eventType, ['payment.paid', 'payment_intent.succeeded'], true)
    || (($attrs['status'] ?? '') === 'paid')
    || (($attrs['status'] ?? '') === 'succeeded');

if (!$isPaidEvent) {
    // Acknowledge other events so PayMongo does not retry forever
    http_response_code(200);
    header('Content-Type: application/json');
    echo json_encode(['ok' => true, 'ignored' => $eventType]);
    exit;
}

// Resolve payment_intent_id
$paymentIntentId = $attrs['payment_intent_id']
    ?? (($resource['type'] ?? '') === 'payment_intent' ? $resourceId : null)
    ?? '';

if ($paymentIntentId === '' && !empty($attrs['payment_intent_id'])) {
    $paymentIntentId = $attrs['payment_intent_id'];
}

// Idempotency: if already recorded as paid, skip email
if ($paymentIntentId && order_already_paid($paymentIntentId)) {
    http_response_code(200);
    header('Content-Type: application/json');
    echo json_encode(['ok' => true, 'duplicate' => true]);
    exit;
}

$pending = $paymentIntentId ? load_pending_order($paymentIntentId) : null;

$amountCentavos = (int)($attrs['amount'] ?? ($pending['amount_centavos'] ?? 0));
$amountDisplay  = $pending['amount_display'] ?? number_format($amountCentavos / 100, 2, '.', '');

$billing = $attrs['billing'] ?? [];
$order = mark_order_paid($paymentIntentId ?: ('unknown_' . time()), [
    'name'            => $pending['name'] ?? ($billing['name'] ?? ''),
    'email'           => $pending['email'] ?? ($billing['email'] ?? ''),
    'phone'           => $pending['phone'] ?? ($billing['phone'] ?? ''),
    'order_ref'       => $pending['order_ref'] ?? '',
    'description'     => $pending['description'] ?? ($attrs['description'] ?? ''),
    'amount_centavos' => $amountCentavos,
    'amount_display'  => $amountDisplay,
    'currency'        => $attrs['currency'] ?? 'PHP',
    'payment_id'      => $resourceId,
    'event_type'      => $eventType,
    'notify_source'   => 'webhook',
    'raw_event_id'    => $payload['data']['id'] ?? '',
]);

$subject = 'New Rene Coffee sale – ₱' . $amountDisplay
    . (!empty($order['order_ref']) ? ' (' . $order['order_ref'] . ')' : '');

$html = build_sale_email_html($order);
$sent = send_sale_notification($OWNER_EMAIL, $subject, $html);

http_response_code(200);
header('Content-Type: application/json');
echo json_encode([
    'ok'         => true,
    'email_sent' => (bool)$sent,
    'order_ref'  => $order['order_ref'] ?? null,
    'pi'         => $paymentIntentId,
]);
