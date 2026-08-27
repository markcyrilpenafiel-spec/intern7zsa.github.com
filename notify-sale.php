<?php
/**
 * Notify shop owner when browser confirms payment (fallback).
 * Prefer webhook.php for reliable server-side notification.
 * POST JSON: { name, email, phone, amount, order_ref, payment_intent_id, quantity }
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

$pi = trim($input['payment_intent_id'] ?? '');

// Avoid duplicate emails if webhook already processed this payment
if ($pi && order_already_paid($pi)) {
    json_response([
        'success'    => true,
        'email_sent' => false,
        'note'       => 'Already recorded by webhook; email skipped',
    ]);
}

$order = [
    'name'              => trim($input['name'] ?? 'Customer'),
    'email'             => trim($input['email'] ?? ''),
    'phone'             => trim($input['phone'] ?? ''),
    'amount_display'    => (string)($input['amount'] ?? ''),
    'order_ref'         => trim($input['order_ref'] ?? ''),
    'payment_intent_id' => $pi,
    'quantity'          => $input['quantity'] ?? 1,
    'notify_source'     => 'browser',
];

if ($pi) {
    $order = mark_order_paid($pi, $order);
}

$subject = 'New Rene Coffee sale – ₱' . $order['amount_display']
    . ($order['order_ref'] ? ' (' . $order['order_ref'] . ')' : '');

$html = build_sale_email_html($order);
$sent = send_sale_notification($OWNER_EMAIL, $subject, $html);

json_response([
    'success'    => true,
    'email_sent' => (bool)$sent,
    'note'       => $sent
        ? 'Owner notified'
        : 'Email not sent (set OWNER_EMAIL + SMTP_USER/SMTP_PASS in config.php)',
]);
