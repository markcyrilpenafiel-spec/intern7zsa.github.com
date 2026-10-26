<?php
/**
 * K-Tix Assist - Configuration (JSON file storage)
 */
session_start();

define('APP_NAME', 'K-Tix Assist');
define('APP_ROOT', dirname(__DIR__, 2));  // project root (so /lib is found on Vercel)
define('DATA_DIR', '/tmp/ktix-data');
define('USERS_FILE', DATA_DIR . '/users.json');
define('UPLOAD_DIR', '/tmp/ktix-uploads');

// Create folders if they don't exist (needed on Vercel)
if (!is_dir(DATA_DIR))  @mkdir(DATA_DIR, 0755, true);
if (!is_dir(UPLOAD_DIR)) @mkdir(UPLOAD_DIR, 0755, true);
// ─── EMAIL / SMTP (edit these for real verification emails) ───
// For Gmail: enable 2FA → create App Password, use smtp.gmail.com port 587
// For local XAMPP testing without real SMTP, set SMTP_ENABLED to false
// and codes will still be generated (check server error log / data/last_codes.log)
define('SMTP_ENABLED', true);
define('SMTP_HOST', 'smtp.gmail.com');
define('SMTP_PORT', 587);
define('SMTP_SECURE', 'tls');          // tls or ssl
define('SMTP_USER', 'markcyrilpenafiel@gmail.com');   // ← change this
define('SMTP_PASS', 'xexspzfbbkbqbhui');      // ← Gmail App Password
define('SMTP_FROM_EMAIL', 'markcyrilpenafiel@gmail.com');
define('SMTP_FROM_NAME', 'K-Tix Assist');

// Face matching threshold (Euclidean distance). 0.58 = moderate
define('FACE_MATCH_THRESHOLD', 0.58);

function getUsers(): array {
    if (!file_exists(USERS_FILE)) {
        $seed = [
            [
                'id' => 1,
                'name' => 'System Administrator',
                'email' => 'admin@ktix.com',
                'password' => password_hash('Admin@123', PASSWORD_DEFAULT),
                'role' => 'admin',
                'verified' => 1,
                'verify_code' => null,
                'id_filename' => null,
                'face_filename' => null,
                'face_embedding' => null,
                'id_number' => null,
                'id_type' => null,
                'id_face_quality' => 100,
                'face_verified' => 1,
                'face_match_score' => 100,
                'reset_token' => null,
                'reset_expires' => null,
                'created_at' => date('c')
            ],
            [
                'id' => 2,
                'name' => 'Staff Member',
                'email' => 'staff@ktix.com',
                'password' => password_hash('Staff@123', PASSWORD_DEFAULT),
                'role' => 'staff',
                'verified' => 1,
                'verify_code' => null,
                'id_filename' => null,
                'face_filename' => null,
                'face_embedding' => null,
                'id_number' => null,
                'id_type' => null,
                'id_face_quality' => 100,
                'face_verified' => 1,
                'face_match_score' => 100,
                'reset_token' => null,
                'reset_expires' => null,
                'created_at' => date('c')
            ]
        ];
        saveUsers($seed);
        return $seed;
    }
    $raw = file_get_contents(USERS_FILE);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function saveUsers(array $users): void {
    file_put_contents(USERS_FILE, json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function findUserByEmail(string $email): ?array {
    $email = strtolower(trim($email));
    foreach (getUsers() as $u) {
        if (strtolower($u['email']) === $email) return $u;
    }
    return null;
}

function findUserById(int $id): ?array {
    foreach (getUsers() as $u) {
        if ((int)$u['id'] === $id) return $u;
    }
    return null;
}

function updateUser(int $id, array $fields): bool {
    $users = getUsers();
    foreach ($users as &$u) {
        if ((int)$u['id'] === $id) {
            foreach ($fields as $k => $v) $u[$k] = $v;
            saveUsers($users);
            return true;
        }
    }
    return false;
}

function nextUserId(): int {
    $max = 0;
    foreach (getUsers() as $u) {
        if ((int)$u['id'] > $max) $max = (int)$u['id'];
    }
    return $max + 1;
}

function jsonResponse(array $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function requireAuth(?string $requiredRole = null): array {
    if (empty($_SESSION['user_id'])) {
        header('Location: /');
        exit;
    }
    $user = findUserById((int)$_SESSION['user_id']);
    if (!$user) {
        session_destroy();
        header('Location: /');
        exit;
    }
    if ($requiredRole !== null && strtolower($user['role']) !== strtolower($requiredRole)) {
        header('Location: ' . roleDashboard($user['role']));
        exit;
    }
    return [
        'id' => $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'verified' => $user['verified']
    ];
}

function isLoggedIn(): bool {
    return !empty($_SESSION['user_id']);
}

function roleDashboard(string $role): string {
    return match (strtolower($role)) {
        'admin' => '/dashboard-admin.php',
        'staff' => '/dashboard-staff.php',
        default => '/dashboard-customer.php',
    };
}

/**
 * Log verification / reset codes to data/last_codes.log for local debugging
 * when SMTP is misconfigured. Never exposed in API responses.
 */
function logCode(string $email, string $type, string $code): void {
    $line = date('c') . " | {$type} | {$email} | {$code}\n";
    @file_put_contents(DATA_DIR . '/last_codes.log', $line, FILE_APPEND | LOCK_EX);
}
