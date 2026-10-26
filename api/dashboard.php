<?php
/**
 * Legacy entry — redirect to role-specific dashboard
 */
require_once __DIR__ . '/includes/config.php';
$user = requireAuth();
header('Location: ' . roleDashboard($user['role']));
exit;
