<?php
/**
 * K-Tix Assist - API (JSON storage)
 * Real email verification + strict ID validation
 */
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/mailer.php';

$action = $_POST['action'] ?? $_GET['action'] ?? '';

switch ($action) {

    case 'login':
        $email = trim($_POST['email'] ?? '');
        $password = $_POST['password'] ?? '';
        $remember = !empty($_POST['remember']);
        $policies = !empty($_POST['policies']);

        if (!$email || !$password) {
            jsonResponse(['ok' => false, 'message' => 'Email and password are required.'], 400);
        }
        if (!$policies) {
            jsonResponse(['ok' => false, 'message' => 'You must accept the Terms of Service & Privacy Policy to log in.'], 400);
        }

        $user = findUserByEmail($email);
        if (!$user || !password_verify($password, $user['password'])) {
            jsonResponse(['ok' => false, 'message' => 'Invalid email or password.'], 401);
        }

        if (!(int)$user['verified']) {
            $code = (string) random_int(100000, 999999);
            updateUser((int)$user['id'], [
                'verify_code' => $code,
                'verify_expires' => time() + 1800
            ]);
            $sent = sendVerificationEmail($user['email'], $user['name'], $code);
            jsonResponse([
                'ok' => false,
                'need_verify' => true,
                'email' => $user['email'],
                'message' => $sent
                    ? 'Email not verified. A new verification code has been sent to your inbox.'
                    : 'Email not verified. Code generated but email could not be sent — check SMTP settings or data/last_codes.log.'
            ], 403);
        }

        $_SESSION['user_id'] = (int)$user['id'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['name'] = $user['name'];

        if ($remember) {
            setcookie('ktix_remember', bin2hex(random_bytes(16)), time() + 60 * 60 * 24 * 30, '/', '', false, true);
        }

        $redirect = roleDashboard($user['role']);
        jsonResponse([
            'ok' => true,
            'message' => 'Welcome back, ' . $user['name'] . '!',
            'redirect' => $redirect,
            'role' => $user['role']
        ]);
        break;

    case 'face_login':
        $email = strtolower(trim($_POST['email'] ?? ''));
        $remember = !empty($_POST['remember']);
        $policies = !empty($_POST['policies']);
        $embeddingRaw = $_POST['face_embedding'] ?? '';

        if (!$email) {
            jsonResponse(['ok' => false, 'message' => 'Email is required for Face ID.'], 400);
        }
        if (!$policies) {
            jsonResponse(['ok' => false, 'message' => 'You must accept the Terms of Service & Privacy Policy.'], 400);
        }
        $liveEmb = json_decode($embeddingRaw, true);
        if (!is_array($liveEmb) || count($liveEmb) < 64) {
            jsonResponse(['ok' => false, 'message' => 'Invalid face embedding. Please try again.'], 400);
        }
        $liveEmb = array_map('floatval', $liveEmb);

        $user = findUserByEmail($email);
        if (!$user) {
            jsonResponse(['ok' => false, 'message' => 'No account found for this email.'], 404);
        }
        if (!(int)$user['verified']) {
            $code = (string) random_int(100000, 999999);
            updateUser((int)$user['id'], [
                'verify_code' => $code,
                'verify_expires' => time() + 1800
            ]);
            $sent = sendVerificationEmail($user['email'], $user['name'], $code);
            jsonResponse([
                'ok' => false,
                'need_verify' => true,
                'email' => $user['email'],
                'message' => $sent
                    ? 'Email not verified. A new verification code has been sent to your inbox.'
                    : 'Email not verified. Check data/last_codes.log if SMTP is not configured.'
            ], 403);
        }

        $stored = $user['face_embedding'] ?? null;
        if (!$stored || !is_array($stored) || count($stored) < 64) {
            jsonResponse([
                'ok' => false,
                'message' => 'No face profile enrolled for this account. Use password login, or re-register as customer to enroll Face ID.'
            ], 400);
        }

        $sum = 0.0;
        $n = min(count($stored), count($liveEmb));
        for ($i = 0; $i < $n; $i++) {
            $d = (float)$stored[$i] - (float)$liveEmb[$i];
            $sum += $d * $d;
        }
        $distance = sqrt($sum);
        $threshold = FACE_MATCH_THRESHOLD;
        $matchScore = max(0, min(100, (int)round((1 - $distance) * 100)));

        if ($distance > $threshold) {
            jsonResponse([
                'ok' => false,
                'message' => 'Face not recognized. Distance ' . round($distance, 3) . ' exceeds threshold. Try better lighting or use password.',
                'match_score' => $matchScore
            ], 401);
        }

        $_SESSION['user_id'] = (int)$user['id'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['name'] = $user['name'];

        if ($remember) {
            setcookie('ktix_remember', bin2hex(random_bytes(16)), time() + 60 * 60 * 24 * 30, '/', '', false, true);
        }

        $redirect = roleDashboard($user['role']);
        jsonResponse([
            'ok' => true,
            'message' => 'Face verified. Welcome back, ' . $user['name'] . '!',
            'redirect' => $redirect,
            'role' => $user['role'],
            'match_score' => $matchScore
        ]);
        break;

    case 'signup':
        $name = trim($_POST['name'] ?? '');
        $email = strtolower(trim($_POST['email'] ?? ''));
        $password = $_POST['password'] ?? '';
        $policies = !empty($_POST['policies']);
        $idNumber = trim($_POST['id_number'] ?? '');
        $idType = trim($_POST['id_type'] ?? '');
        $idFaceQuality = (int)($_POST['id_face_quality'] ?? 0);
        $faceMatchScore = (float)($_POST['face_match_score'] ?? 0);
        $faceVerified = !empty($_POST['face_verified']) ? 1 : 0;
        $idHasFace = !empty($_POST['id_has_face']) ? 1 : 0;
        $idOcrScore = (int)($_POST['id_ocr_score'] ?? 0);
        $idOcrText = trim($_POST['id_ocr_text'] ?? '');
        $faceEmbeddingRaw = $_POST['face_embedding'] ?? '';
        $faceEmbedding = null;
        if ($faceEmbeddingRaw !== '') {
            $decoded = json_decode($faceEmbeddingRaw, true);
            if (is_array($decoded) && count($decoded) >= 64) {
                $faceEmbedding = array_map('floatval', $decoded);
            }
        }

        if (!$name || !$email || !$password) {
            jsonResponse(['ok' => false, 'message' => 'Name, email and password are required.'], 400);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['ok' => false, 'message' => 'Please enter a valid email address.'], 400);
        }
        if (strlen($password) < 8) {
            jsonResponse(['ok' => false, 'message' => 'Password must be at least 8 characters.'], 400);
        }
        if (!$policies) {
            jsonResponse(['ok' => false, 'message' => 'You must accept the Terms of Service & Privacy Policy.'], 400);
        }
        if (findUserByEmail($email)) {
            jsonResponse(['ok' => false, 'message' => 'This email is already registered. Please log in or use Forgot Password.'], 409);
        }
        if (!$faceVerified || !$faceEmbedding) {
            jsonResponse(['ok' => false, 'message' => 'Please complete facial recognition before creating an account.'], 400);
        }

        // ── Strict ID validation ──
        if (!$idType || !in_array($idType, ['National ID', 'Passport', "Driver's License", 'PhilSys ID'], true)) {
            jsonResponse(['ok' => false, 'message' => 'Please select a valid ID type.'], 400);
        }
        if (!$idHasFace) {
            jsonResponse(['ok' => false, 'message' => 'No face detected on the uploaded ID. Please upload a clear photo of a real government ID that shows your face.'], 400);
        }
        if ($idFaceQuality < 40) {
            jsonResponse(['ok' => false, 'message' => 'ID photo quality is too low. Use a clearer, well-lit photo of your ID.'], 400);
        }
        // OCR must find ID-like text (client-side Tesseract)
        if ($idOcrScore < 25) {
            jsonResponse(['ok' => false, 'message' => 'This does not appear to be a valid ID document. Upload a real government-issued ID (National ID, Passport, Driver\'s License, or PhilSys).'], 400);
        }
        if (strlen($idNumber) < 4) {
            jsonResponse(['ok' => false, 'message' => 'Could not read a valid ID number from the document. Ensure the ID is clear and fully visible.'], 400);
        }

        // Save ID image
        $idFilename = null;
        if (!empty($_FILES['id_file']['tmp_name']) && is_uploaded_file($_FILES['id_file']['tmp_name'])) {
            $ext = strtolower(pathinfo($_FILES['id_file']['name'], PATHINFO_EXTENSION) ?: 'jpg');
            if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) {
                jsonResponse(['ok' => false, 'message' => 'ID must be JPG or PNG.'], 400);
            }
            if ($_FILES['id_file']['size'] > 5 * 1024 * 1024) {
                jsonResponse(['ok' => false, 'message' => 'ID file too large (max 5MB).'], 400);
            }
            // Basic image check
            $imgInfo = @getimagesize($_FILES['id_file']['tmp_name']);
            if ($imgInfo === false) {
                jsonResponse(['ok' => false, 'message' => 'Uploaded file is not a valid image.'], 400);
            }
            if ($imgInfo[0] < 200 || $imgInfo[1] < 120) {
                jsonResponse(['ok' => false, 'message' => 'ID image is too small. Capture a larger, clearer photo.'], 400);
            }
            $idFilename = 'id_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
            if (!@move_uploaded_file($_FILES['id_file']['tmp_name'], UPLOAD_DIR . '/' . $idFilename)) {
                jsonResponse(['ok' => false, 'message' => 'Failed to save ID file. Check uploads/ permissions.'], 500);
            }
        } else {
            jsonResponse(['ok' => false, 'message' => 'ID photo is required.'], 400);
        }

        // Save face capture
        $faceFilename = null;
        if (!empty($_FILES['face_file']['tmp_name']) && is_uploaded_file($_FILES['face_file']['tmp_name'])) {
            $ext = strtolower(pathinfo($_FILES['face_file']['name'], PATHINFO_EXTENSION) ?: 'jpg');
            if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) {
                $ext = 'jpg';
            }
            $faceFilename = 'face_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
            @move_uploaded_file($_FILES['face_file']['tmp_name'], UPLOAD_DIR . '/' . $faceFilename);
        }

        $code = (string) random_int(100000, 999999);
        $users = getUsers();
        $users[] = [
            'id' => nextUserId(),
            'name' => $name,
            'email' => $email,
            'password' => password_hash($password, PASSWORD_DEFAULT),
            'role' => 'customer',
            'verified' => 0,
            'verify_code' => $code,
            'verify_expires' => time() + 1800,
            'id_filename' => $idFilename,
            'face_filename' => $faceFilename,
            'face_embedding' => $faceEmbedding,
            'id_number' => $idNumber,
            'id_type' => $idType,
            'id_face_quality' => $idFaceQuality,
            'id_ocr_score' => $idOcrScore,
            'id_ocr_snippet' => mb_substr($idOcrText, 0, 200),
            'face_verified' => $faceVerified,
            'face_match_score' => $faceMatchScore,
            'reset_token' => null,
            'reset_expires' => null,
            'created_at' => date('c')
        ];
        saveUsers($users);

        $sent = sendVerificationEmail($email, $name, $code);

        jsonResponse([
            'ok' => true,
            'message' => $sent
                ? 'Account created. Please check your email for the 6-digit verification code.'
                : 'Account created. Verification email could not be sent — check SMTP in includes/config.php or look in data/last_codes.log for the code.',
            'email' => $email
        ]);
        break;

    case 'verify':
        $email = strtolower(trim($_POST['email'] ?? ''));
        $code = trim($_POST['code'] ?? '');
        if (!$email || !$code) {
            jsonResponse(['ok' => false, 'message' => 'Email and code are required.'], 400);
        }
        $user = findUserByEmail($email);
        if (!$user) {
            jsonResponse(['ok' => false, 'message' => 'Account not found.'], 404);
        }
        if ((int)$user['verified']) {
            jsonResponse(['ok' => true, 'message' => 'Email is already verified. You can log in.']);
        }
        $expires = (int)($user['verify_expires'] ?? 0);
        if ($expires && time() > $expires) {
            jsonResponse(['ok' => false, 'message' => 'Verification code has expired. Please request a new one.'], 400);
        }
        if (($user['verify_code'] ?? '') !== $code) {
            jsonResponse(['ok' => false, 'message' => 'Invalid verification code.'], 400);
        }
        updateUser((int)$user['id'], [
            'verified' => 1,
            'verify_code' => null,
            'verify_expires' => null
        ]);
        jsonResponse(['ok' => true, 'message' => 'Email verified successfully. You can now log in.']);
        break;

    case 'resend_code':
        $email = strtolower(trim($_POST['email'] ?? ''));
        if (!$email) jsonResponse(['ok' => false, 'message' => 'Email is required.'], 400);
        $user = findUserByEmail($email);
        if (!$user) jsonResponse(['ok' => false, 'message' => 'Account not found.'], 404);
        if ((int)$user['verified']) jsonResponse(['ok' => false, 'message' => 'Email is already verified.'], 400);
        $code = (string) random_int(100000, 999999);
        updateUser((int)$user['id'], [
            'verify_code' => $code,
            'verify_expires' => time() + 1800
        ]);
        $sent = sendVerificationEmail($user['email'], $user['name'], $code);
        jsonResponse([
            'ok' => true,
            'message' => $sent
                ? 'New verification code sent to your email.'
                : 'Code generated but email failed. Check SMTP settings or data/last_codes.log.'
        ]);
        break;

    case 'forgot':
        $email = strtolower(trim($_POST['email'] ?? ''));
        if (!$email) jsonResponse(['ok' => false, 'message' => 'Email is required.'], 400);
        $user = findUserByEmail($email);
        // Always same message (no email enumeration)
        if ($user) {
            $tempPass = 'Temp@' . random_int(100000, 999999);
            updateUser((int)$user['id'], [
                'password' => password_hash($tempPass, PASSWORD_DEFAULT),
                'reset_token' => bin2hex(random_bytes(16)),
                'reset_expires' => time() + 3600
            ]);
            sendPasswordResetEmail($user['email'], $user['name'], $tempPass);
        }
        jsonResponse([
            'ok' => true,
            'message' => 'If an account exists for that email, a temporary password has been sent. Check your inbox (and spam folder).'
        ]);
        break;

    case 'logout':
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
        setcookie('ktix_remember', '', time() - 3600, '/');
        jsonResponse(['ok' => true, 'redirect' => 'index.php']);
        break;

    default:
        jsonResponse(['ok' => false, 'message' => 'Unknown action.'], 400);
}
