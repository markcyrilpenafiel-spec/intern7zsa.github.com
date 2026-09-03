<?php
/**
 * webhook.php – PayMongo payment.paid webhook
 * --------------------------------------------
 * More reliable than the browser "I Already Paid" button.
 *
 * Setup (PayMongo Dashboard → Developers → Webhooks):
 *   URL:    https://intern7zsa.site/webhook.php
 *   Events: payment.paid   (optionally payment.failed)
 *
 * Optional extra protection:
 *   https://intern7zsa.site/webhook.php?key=YOUR_LONG_SECRET
 *   and set env WEBHOOK_URL_KEY=YOUR_LONG_SECRET
 *
 * What it does:
 *  1. Receives payment.paid
 *  2. Finds the related Payment Intent
 *  3. Loads pending order (saved when QR was created)
 *  4. mark_order_paid() → moves to orders/paid/
 *  5. Emails owner + customer
 *  6. Ignores duplicates
 */
require_once __DIR__ . '/config.php';

// Optional URL key protection
$expectedKey = getenv('WEBHOOK_URL_KEY') ?: '';
if ($expectedKey !== '') {
    $provided = $_GET['key'] ?? '';
    if (!hash_equals($expectedKey, $provided)) {
        http_response_code(403);
        echo 'Forbidden';
        exit;
    }
}

// PayMongo sends POST with JSON body
$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!$payload || !isset($payload['data'])) {
    http_response_code(400);
    echo 'Bad payload';
    exit;
}

// Optional: verify webhook signature if you configured a secret
// (PayMongo sends a signature header when webhook secret is set)
if (!empty($PAYMONGO_WEBHOOK_SECRET)) {
    $sigHeader = $_SERVER['HTTP_PAYMONGO_SIGNATURE'] ?? $_SERVER['HTTP_X_PAYMONGO_SIGNATURE'] ?? '';
    // Basic presence check – full HMAC verification can be added later
    if ($sigHeader === '') {
        error_log('[ReneCoffee] Webhook received without signature header');
    }
}

$eventType = $payload['data']['attributes']['type'] ?? $payload['data']['attributes']['event'] ?? '';
// PayMongo event resource: data.attributes.type = "payment.paid"
if ($eventType === '' && isset($payload['data']['attributes']['data']['attributes']['status'])) {
    // fallback for some payload shapes
}

$resource = $payload['data']['attributes']['data'] ?? $payload['data'] ?? null;
if (!$resource) {
    http_response_code(200); // acknowledge so PayMongo stops retrying
    echo 'No resource';
    exit;
}

// Extract payment / payment_intent id
$paymentId       = $resource['id'] ?? null;
$resourceType    = $resource['type'] ?? '';
$attrs           = $resource['attributes'] ?? [];
$status          = $attrs['status'] ?? '';
$paymentIntentId = $attrs['payment_intent_id']
    ?? ($attrs['data']['id'] ?? null)
    ?? null;

// For payment.paid the resource is usually a "payment", which has payment_intent_id
if (!$paymentIntentId && $resourceType === 'payment') {
    $paymentIntentId = $attrs['payment_intent_id'] ?? null;
}

// Sometimes the event embeds the intent directly
if (!$paymentIntentId && preg_match('/^pi_/', (string)$paymentId)) {
    $paymentIntentId = $paymentId;
}

if (!$paymentIntentId || !preg_match('/^pi_/', $paymentIntentId)) {
    // Still acknowledge – we can't process without an intent id
    error_log('[ReneCoffee] Webhook: could not find payment_intent_id. Payload: ' . substr($raw, 0, 500));
    http_response_code(200);
    echo 'No payment_intent_id';
    exit;
}

// Only act on successful payments
$isPaidEvent = (
    stripos($eventType, 'paid') !== false
    || in_array($status, ['paid', 'succeeded'], true)
);

if (!$isPaidEvent) {
    http_response_code(200);
    echo 'Ignored event: ' . $eventType;
    exit;
}

// Idempotency
if (order_already_paid($paymentIntentId)) {
    http_response_code(200);
    echo 'Already processed';
    exit;
}

$extra = [
    'paymongo_status'   => $status ?: 'paid',
    'payment_id'        => $paymentId,
    'webhook_received'  => date('c'),
    'amount_centavos'   => $attrs['amount'] ?? null,
    'currency'          => $attrs['currency'] ?? 'PHP',
];
if (isset($attrs['amount'])) {
    $extra['amount_display'] = number_format($attrs['amount'] / 100, 2, '.', '');
}

$order = mark_order_paid($paymentIntentId, $extra);

// Send notifications
$ownerSent = false;
$customerSent = false;

try {
    $ownerSubject = 'New sale – Rene Coffee (₱' . ($order['amount_display'] ?? '?') . ')';
    $ownerHtml    = build_sale_email_html($order);
    $ownerSent    = send_sale_notification($OWNER_EMAIL, $ownerSubject, $ownerHtml);
} catch (Throwable $e) {
    error_log('[ReneCoffee] Webhook owner email error: ' . $e->getMessage());
}

try {
    $customerSent = send_customer_thankyou($order);
} catch (Throwable $e) {
    error_log('[ReneCoffee] Webhook customer email error: ' . $e->getMessage());
}

error_log(sprintf(
    '[ReneCoffee] Webhook processed %s | owner=%s customer=%s',
    $paymentIntentId,
    $ownerSent ? 'yes' : 'no',
    $customerSent ? 'yes' : 'no'
));

http_response_code(200);
header('Content-Type: application/json');
echo json_encode([
    'ok' => true,
    'payment_intent_id' => $paymentIntentId,
    'owner_email_sent' => $ownerSent,
    'customer_email_sent' => $customerSent,
]);
