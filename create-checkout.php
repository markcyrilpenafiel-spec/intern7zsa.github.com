<?php
/**
 * Create PayMongo Checkout Session (card / GCash / Maya / QR Ph).
 * POST JSON: { amount (centavos), description, customer{name,email,phone}, success_url, cancel_url }
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
$customer    = $input['customer'] ?? [];
$success_url = $input['success_url'] ?? (rtrim($SITE_URL, '/') . '/Success.html');
$cancel_url  = $input['cancel_url']  ?? (rtrim($SITE_URL, '/') . '/checkout.html');

if ($amount < $MIN_AMOUNT_CENTAVOS) {
    json_response(['error' => 'Amount must be at least ₱1.00'], 400);
}

$SECRET_KEY = $PAYMONGO_SECRET_KEY;
if (strpos($SECRET_KEY, 'YOUR_SECRET') !== false || $SECRET_KEY === '') {
    json_response(['error' => 'PayMongo secret key not configured on server.'], 500);
}

$payload = [
    'data' => [
        'attributes' => [
            'line_items' => [[
                'name'     => $description,
                'amount'   => $amount,
                'currency' => 'PHP',
                'quantity' => 1,
            ]],
            'payment_method_types' => ['qrph', 'gcash', 'paymaya', 'card'],
            'success_url'          => $success_url,
            'cancel_url'           => $cancel_url,
            'reference_number'     => 'ORDER-' . time(),
            'billing' => [
                'name'  => $customer['name']  ?? '',
                'email' => $customer['email'] ?? '',
                'phone' => $customer['phone'] ?? '',
            ],
        ],
    ],
];

$ch = curl_init('https://api.paymongo.com/v1/checkout_sessions');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($payload),
    CURLOPT_HTTPHEADER     => paymongo_headers($SECRET_KEY),
    CURLOPT_TIMEOUT        => 30,
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$data = json_decode($response, true);

if ($httpCode >= 200 && $httpCode < 300 && isset($data['data']['attributes']['checkout_url'])) {
    json_response([
        'checkout_url' => $data['data']['attributes']['checkout_url'],
        'session_id'   => $data['data']['id'],
    ]);
}

$msg = $data['errors'][0]['detail'] ?? 'Failed to create checkout session';
json_response(['error' => $msg, 'details' => $data], 400);
