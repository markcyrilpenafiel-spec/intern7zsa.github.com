<?php
/**
 * Create PayMongo QR Ph payment intent + method and return QR image URL.
 * POST JSON: { amount (centavos), description, name, email, phone }
 */
require_once __DIR__ . '/config.php';

apply_cors($ALLOWED_ORIGINS);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'Method not allowed'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    json_response(['error' => 'Invalid JSON'], 400);
}

$amount      = isset($input['amount']) ? (int)$input['amount'] : 0;
$description = trim($input['description'] ?? 'Coffee Blend Order');
$name        = trim($input['name'] ?? '');
$email       = trim($input['email'] ?? '');
$phone       = trim($input['phone'] ?? '');

if ($amount < $MIN_AMOUNT_CENTAVOS) {
    json_response(['error' => 'Minimum amount is ₱1.00'], 400);
}
if ($email === '' || $name === '') {
    json_response(['error' => 'Name and email are required'], 400);
}

$SECRET_KEY = $PAYMONGO_SECRET_KEY;
if (strpos($SECRET_KEY, 'YOUR_SECRET') !== false || $SECRET_KEY === '') {
    json_response([
        'error' => 'PayMongo secret key not configured. Set PAYMONGO_SECRET_KEY or edit config.php on the server.'
    ], 500);
}

function paymongo_request($url, $payload, $secretKey) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER     => paymongo_headers($secretKey),
        CURLOPT_TIMEOUT        => 30,
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    return [$code, json_decode($body, true), $err];
}

// 1) Payment Intent (QR Ph only)
$intentPayload = [
    'data' => [
        'attributes' => [
            'amount'                 => $amount,
            'currency'               => 'PHP',
            'payment_method_allowed' => ['qrph'],
            'description'            => $description,
            'statement_descriptor'   => 'CoffeeBlend',
        ],
    ],
];

[$http, $intentData, $curlErr] = paymongo_request(
    'https://api.paymongo.com/v1/payment_intents',
    $intentPayload,
    $SECRET_KEY
);

if ($curlErr) {
    json_response(['error' => 'Network error: ' . $curlErr], 502);
}
if ($http >= 400 || !isset($intentData['data']['id'])) {
    $msg = $intentData['errors'][0]['detail'] ?? 'Failed to create Payment Intent';
    json_response(['error' => $msg, 'details' => $intentData], 400);
}

$paymentIntentId = $intentData['data']['id'];
$clientKey       = $intentData['data']['attributes']['client_key'];

// 2) Payment Method (qrph)
$methodPayload = [
    'data' => [
        'attributes' => [
            'type' => 'qrph',
            'billing' => [
                'name'  => $name,
                'email' => $email,
                'phone' => $phone,
            ],
        ],
    ],
];

[$http, $methodData, $curlErr] = paymongo_request(
    'https://api.paymongo.com/v1/payment_methods',
    $methodPayload,
    $SECRET_KEY
);

if ($curlErr) {
    json_response(['error' => 'Network error: ' . $curlErr], 502);
}
if (!isset($methodData['data']['id'])) {
    $msg = $methodData['errors'][0]['detail'] ?? 'Failed to create Payment Method';
    json_response(['error' => $msg, 'details' => $methodData], 400);
}

$paymentMethodId = $methodData['data']['id'];

// 3) Attach method → generates QR
$attachPayload = [
    'data' => [
        'attributes' => [
            'payment_method' => $paymentMethodId,
            'client_key'     => $clientKey,
            'return_url'     => rtrim($SITE_URL, '/') . '/Success.html',
        ],
    ],
];

[$http, $attachData, $curlErr] = paymongo_request(
    "https://api.paymongo.com/v1/payment_intents/{$paymentIntentId}/attach",
    $attachPayload,
    $SECRET_KEY
);

if ($curlErr) {
    json_response(['error' => 'Network error: ' . $curlErr], 502);
}

$qrImageUrl = $attachData['data']['attributes']['next_action']['code']['image_url']
    ?? $attachData['data']['attributes']['next_action']['redirect']['url']
    ?? null;

$status = $attachData['data']['attributes']['status'] ?? null;

if (!$qrImageUrl && $status !== 'succeeded') {
    $msg = $attachData['errors'][0]['detail'] ?? 'Failed to generate QR code';
    json_response(['error' => $msg, 'details' => $attachData], 400);
}

// Save pending order so webhook can email full customer details
$orderRef = 'ORDER-' . time();
save_pending_order($paymentIntentId, [
    'order_ref'       => $orderRef,
    'name'            => $name,
    'email'           => $email,
    'phone'           => $phone,
    'description'     => $description,
    'amount_centavos' => $amount,
    'amount_display'  => number_format($amount / 100, 2, '.', ''),
    'currency'        => 'PHP',
]);

json_response([
    'success'           => true,
    'payment_intent_id' => $paymentIntentId,
    'qr_image_url'      => $qrImageUrl,
    'client_key'        => $clientKey,
    'status'            => $status,
    'order_ref'         => $orderRef,
]);
