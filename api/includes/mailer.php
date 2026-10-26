<?php
/**
 * K-Tix Assist - Real email sender (PHPMailer)
 */
require_once __DIR__ . '/config.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require_once APP_ROOT . '/lib/src/Exception.php';
require_once APP_ROOT . '/lib/src/PHPMailer.php';
require_once APP_ROOT . '/lib/src/SMTP.php';

/**
 * Send an HTML email. Returns true on success.
 */
function sendAppEmail(string $toEmail, string $toName, string $subject, string $htmlBody, string $textBody = ''): bool {
    if (!SMTP_ENABLED) {
        logCode($toEmail, 'EMAIL_DISABLED', $subject);
        return false;
    }

    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = SMTP_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = SMTP_USER;
        $mail->Password   = SMTP_PASS;
        $mail->SMTPSecure = SMTP_SECURE;
        $mail->Port       = SMTP_PORT;
        $mail->CharSet    = 'UTF-8';
        $mail->Timeout    = 20;          // important on serverless
        $mail->SMTPKeepAlive = false;

        // Fix for XAMPP / Windows SSL errors
        $mail->SMTPOptions = [
            'ssl' => [
                'verify_peer'       => false,
                'verify_peer_name'  => false,
                'allow_self_signed' => true,
            ],
        ];

        $mail->setFrom(SMTP_FROM_EMAIL, SMTP_FROM_NAME);
        $mail->addAddress($toEmail, $toName);
        $mail->addReplyTo(SMTP_FROM_EMAIL, SMTP_FROM_NAME);
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $htmlBody;
        $mail->AltBody = $textBody ?: strip_tags($htmlBody);

        $mail->send();
        logCode($toEmail, 'MAIL_OK', $subject);
        return true;
    } catch (Exception $e) {
        $err = $mail->ErrorInfo ?: $e->getMessage();
        error_log('K-Tix mail error: ' . $err);
        logCode($toEmail, 'MAIL_FAIL', $err);
        return false;
    }
}

function sendVerificationEmail(string $email, string $name, string $code): bool {
    $subject = 'Your K-Tix Assist verification code';
    $html = '
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;">
      <h2 style="color:#0f172a;margin:0 0 8px;">Verify your email</h2>
      <p style="color:#64748b;margin:0 0 20px;">Hi ' . htmlspecialchars($name) . ', use this code to verify your K-Tix Assist account:</p>
      <div style="background:#fff;border:2px solid #2563eb;border-radius:8px;padding:16px;text-align:center;font-size:28px;letter-spacing:8px;font-weight:700;color:#0f172a;">'
        . htmlspecialchars($code) . '</div>
      <p style="color:#94a3b8;font-size:13px;margin-top:20px;">This code expires in 30 minutes. If you did not sign up, ignore this email.</p>
      <p style="color:#94a3b8;font-size:12px;">— K-Tix Assist</p>
    </div>';
    $ok = sendAppEmail($email, $name, $subject, $html, "Your verification code is: {$code}");
    logCode($email, 'VERIFY', $code);
    return $ok;
}

function sendPasswordResetEmail(string $email, string $name, string $tempPass): bool {
    $subject = 'K-Tix Assist password reset';
    $html = '
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;">
      <h2 style="color:#0f172a;margin:0 0 8px;">Password reset</h2>
      <p style="color:#64748b;margin:0 0 20px;">Hi ' . htmlspecialchars($name) . ', your temporary password is:</p>
      <div style="background:#fff;border:2px solid #2563eb;border-radius:8px;padding:16px;text-align:center;font-size:20px;font-weight:700;color:#0f172a;">'
        . htmlspecialchars($tempPass) . '</div>
      <p style="color:#64748b;margin-top:16px;">Log in with this password, then change it in your profile. It is valid for 1 hour.</p>
      <p style="color:#94a3b8;font-size:12px;">— K-Tix Assist</p>
    </div>';
    $ok = sendAppEmail($email, $name, $subject, $html, "Your temporary password is: {$tempPass}");
    logCode($email, 'RESET', $tempPass);
    return $ok;
}
