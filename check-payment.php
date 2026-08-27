<?php
/**
 * Check PayMongo Payment Intent status.
 * GET ?id=pi_xxxxx   or  POST { "payment_intent_id": "pi_xxx" }
 */
require_once __DIR__ . '/config.php';

apply_cors($ALLOWED_ORIGINS);

$SECRET_KEY = $PAYMONGO_SECRET_KEY;
if (strpos($SECRET_KEY, 'YOUR_SECRET') !== false || $SECRET_KEY === '') {
    json_response(['error' => 'PayMongo secret key not configured on server.'], 500);
}

$id = $_GET['id'] ?? null;
if (!$id && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['payment_intent_id'] ?? null;
}

if (!$id || !preg_match('/^pi_/', $id)) {
    json_response(['error' => 'Valid payment_intent_id required'], 400);
}

$ch = curl_init('https://api.paymongo.com/v1/payment_intents/' . urlencode($id));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => paymongo_headers($SECRET_KEY),
    CURLOPT_TIMEOUT        => 20,
]);
$body = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$data = json_decode($body, true);
if ($code >= 400 || !isset($data['data'])) {
    $msg = $data['errors'][0]['detail'] ?? 'Unable to fetch payment status';
    json_response(['error' => $msg], 400);
}

$attrs = $data['data']['attributes'];
json_response([
    'success'           => true,
    'payment_intent_id' => $data['data']['id'],
    'status'            => $attrs['status'] ?? 'unknown',
    'amount'            => $attrs['amount'] ?? null,
    'currency'          => $attrs['currency'] ?? 'PHP',
    'paid'              => in_array(($attrs['status'] ?? ''), ['succeeded', 'paid'], true),
]);
