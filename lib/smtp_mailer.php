<?php
/**
 * Minimal pure-PHP SMTP client (no Composer / PHPMailer needed).
 * Supports STARTTLS (port 587) and SSL (port 465).
 * Designed for Gmail App Passwords.
 */
class SmtpMailer
{
    private $host;
    private $port;
    private $user;
    private $pass;
    private $secure; // 'tls' or 'ssl'
    private $lastError = '';
    private $socket = null;
    private $timeout = 30;

    public function __construct($host, $port, $user, $pass, $secure = 'tls')
    {
        $this->host   = $host;
        $this->port   = (int)$port;
        $this->user   = $user;
        $this->pass   = $pass;
        $this->secure = strtolower($secure);
    }

    public function getLastError()
    {
        return $this->lastError;
    }

    /**
     * Send an HTML email.
     * @return bool true on success
     */
    public function send($fromEmail, $fromName, $toEmail, $subject, $htmlBody)
    {
        $this->lastError = '';
        try {
            $this->connect();
            $this->ehlo();

            if ($this->secure === 'tls') {
                $this->command('STARTTLS', 220);
                if (!stream_socket_enable_crypto($this->socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new Exception('STARTTLS failed');
                }
                $this->ehlo(); // must EHLO again after STARTTLS
            }

            $this->auth();
            $this->command('MAIL FROM:<' . $fromEmail . '>', 250);
            $this->command('RCPT TO:<' . $toEmail . '>', 250);
            $this->command('DATA', 354);

            $headers  = $this->buildHeaders($fromEmail, $fromName, $toEmail, $subject);
            $message  = $headers . "\r\n" . $this->normalizeBody($htmlBody) . "\r\n.";
            $this->write($message);
            $resp = $this->read();
            if (strpos($resp, '250') !== 0) {
                throw new Exception('DATA rejected: ' . trim($resp));
            }

            $this->command('QUIT', 221);
            $this->close();
            return true;
        } catch (Exception $e) {
            $this->lastError = $e->getMessage();
            $this->close();
            return false;
        }
    }

    private function connect()
    {
        $remote = ($this->secure === 'ssl' ? 'ssl://' : '') . $this->host . ':' . $this->port;
        $this->socket = @stream_socket_client(
            $remote,
            $errno,
            $errstr,
            $this->timeout,
            STREAM_CLIENT_CONNECT,
            stream_context_create(['ssl' => [
                'verify_peer'       => true,
                'verify_peer_name'  => true,
                'allow_self_signed' => false,
            ]])
        );
        if (!$this->socket) {
            throw new Exception("Connect failed: $errstr ($errno)");
        }
        stream_set_timeout($this->socket, $this->timeout);
        $greeting = $this->read();
        if (strpos($greeting, '220') !== 0) {
            throw new Exception('Bad greeting: ' . trim($greeting));
        }
    }

    private function ehlo()
    {
        $host = gethostname() ?: 'localhost';
        $this->command('EHLO ' . $host, 250);
    }

    private function auth()
    {
        $this->command('AUTH LOGIN', 334);
        $this->command(base64_encode($this->user), 334);
        $this->command(base64_encode($this->pass), 235);
    }

    private function command($cmd, $expectCode)
    {
        $this->write($cmd);
        $resp = $this->read();
        $code = (int)substr($resp, 0, 3);
        if ($code !== (int)$expectCode) {
            throw new Exception("Expected $expectCode, got: " . trim($resp));
        }
        return $resp;
    }

    private function write($data)
    {
        $data = rtrim($data, "\r\n") . "\r\n";
        $written = fwrite($this->socket, $data);
        if ($written === false) {
            throw new Exception('Write failed');
        }
    }

    private function read()
    {
        $data = '';
        while ($line = fgets($this->socket, 515)) {
            $data .= $line;
            // Multi-line replies have a hyphen after the code (e.g. 250-)
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }
        return $data;
    }

    private function close()
    {
        if (is_resource($this->socket)) {
            fclose($this->socket);
            $this->socket = null;
        }
    }

    private function buildHeaders($fromEmail, $fromName, $toEmail, $subject)
    {
        $fromNameEncoded = $this->encodeHeader($fromName);
        $subjectEncoded  = $this->encodeHeader($subject);
        $date = date('r');
        $msgId = '<' . bin2hex(random_bytes(12)) . '@' . ($this->host ?: 'localhost') . '>';

        $h = [];
        $h[] = 'Date: ' . $date;
        $h[] = 'From: ' . $fromNameEncoded . ' <' . $fromEmail . '>';
        $h[] = 'To: <' . $toEmail . '>';
        $h[] = 'Reply-To: ' . $fromEmail;
        $h[] = 'Subject: ' . $subjectEncoded;
        $h[] = 'Message-ID: ' . $msgId;
        $h[] = 'MIME-Version: 1.0';
        $h[] = 'Content-Type: text/html; charset=UTF-8';
        $h[] = 'Content-Transfer-Encoding: 8bit';
        $h[] = 'X-Mailer: ReneCoffee-SmtpMailer/1.0';
        return implode("\r\n", $h);
    }

    private function encodeHeader($str)
    {
        if (preg_match('/[^\x20-\x7E]/', $str)) {
            return '=?UTF-8?B?' . base64_encode($str) . '?=';
        }
        return $str;
    }

    private function normalizeBody($body)
    {
        // Dot-stuffing: lines starting with . must become ..
        $body = str_replace(["\r\n", "\r"], "\n", $body);
        $body = str_replace("\n", "\r\n", $body);
        $body = preg_replace('/^\./m', '..', $body);
        return $body;
    }
}
