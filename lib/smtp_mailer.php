<?php
/**
 * Lightweight SMTP mailer (Gmail / any SMTP) – no Composer required.
 * Uses STARTTLS on port 587 by default.
 */
class SmtpMailer {
    private $host;
    private $port;
    private $user;
    private $pass;
    private $secure; // tls | ssl | ''
    private $timeout;
    private $lastError = '';

    public function __construct($host, $port, $user, $pass, $secure = 'tls', $timeout = 20) {
        $this->host = $host;
        $this->port = (int)$port;
        $this->user = $user;
        $this->pass = $pass;
        $this->secure = $secure;
        $this->timeout = $timeout;
    }

    public function getLastError() {
        return $this->lastError;
    }

    public function send($fromEmail, $fromName, $toEmail, $subject, $htmlBody) {
        $this->lastError = '';
        $remote = ($this->secure === 'ssl' ? 'ssl://' : '') . $this->host;
        $fp = @stream_socket_client(
            $remote . ':' . $this->port,
            $errno,
            $errstr,
            $this->timeout,
            STREAM_CLIENT_CONNECT
        );
        if (!$fp) {
            $this->lastError = "Connect failed: $errstr ($errno)";
            return false;
        }
        stream_set_timeout($fp, $this->timeout);

        if (!$this->expect($fp, 220)) return $this->fail($fp, 'Banner');
        $this->cmd($fp, 'EHLO rene-coffee.local');
        if (!$this->expect($fp, 250)) {
            $this->cmd($fp, 'HELO rene-coffee.local');
            if (!$this->expect($fp, 250)) return $this->fail($fp, 'EHLO/HELO');
        }

        if ($this->secure === 'tls') {
            $this->cmd($fp, 'STARTTLS');
            if (!$this->expect($fp, 220)) return $this->fail($fp, 'STARTTLS');
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                $this->lastError = 'TLS negotiation failed';
                fclose($fp);
                return false;
            }
            $this->cmd($fp, 'EHLO rene-coffee.local');
            if (!$this->expect($fp, 250)) return $this->fail($fp, 'EHLO after TLS');
        }

        if ($this->user !== '') {
            $this->cmd($fp, 'AUTH LOGIN');
            if (!$this->expect($fp, 334)) return $this->fail($fp, 'AUTH LOGIN');
            $this->cmd($fp, base64_encode($this->user));
            if (!$this->expect($fp, 334)) return $this->fail($fp, 'AUTH user');
            $this->cmd($fp, base64_encode($this->pass));
            if (!$this->expect($fp, 235)) return $this->fail($fp, 'AUTH pass');
        }

        $this->cmd($fp, 'MAIL FROM:<' . $fromEmail . '>');
        if (!$this->expect($fp, 250)) return $this->fail($fp, 'MAIL FROM');
        $this->cmd($fp, 'RCPT TO:<' . $toEmail . '>');
        if (!$this->expect($fp, 250)) return $this->fail($fp, 'RCPT TO');
        $this->cmd($fp, 'DATA');
        if (!$this->expect($fp, 354)) return $this->fail($fp, 'DATA');

        $boundary = 'b_' . md5(uniqid((string)mt_rand(), true));
        $headers = [];
        $headers[] = 'From: ' . $this->encodeAddress($fromName, $fromEmail);
        $headers[] = 'To: <' . $toEmail . '>';
        $headers[] = 'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=';
        $headers[] = 'MIME-Version: 1.0';
        $headers[] = 'Content-Type: text/html; charset=UTF-8';
        $headers[] = 'Content-Transfer-Encoding: base64';
        $headers[] = 'Date: ' . date('r');
        $headers[] = 'Message-ID: <' . uniqid('rene_', true) . '@rene-coffee.local>';

        $data = implode("\r\n", $headers) . "\r\n\r\n" .
            chunk_split(base64_encode($htmlBody)) . "\r\n.";
        fwrite($fp, $data . "\r\n");
        if (!$this->expect($fp, 250)) return $this->fail($fp, 'Message body');

        $this->cmd($fp, 'QUIT');
        fclose($fp);
        return true;
    }

    private function encodeAddress($name, $email) {
        if ($name === '') return '<' . $email . '>';
        return '=?UTF-8?B?' . base64_encode($name) . '?= <' . $email . '>';
    }

    private function cmd($fp, $line) {
        fwrite($fp, $line . "\r\n");
    }

    private function expect($fp, $code) {
        $resp = '';
        while ($line = fgets($fp, 515)) {
            $resp .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
            if ($line === false) break;
        }
        $ok = (strpos($resp, (string)$code) === 0);
        if (!$ok) $this->lastError = trim($resp);
        return $ok;
    }

    private function fail($fp, $step) {
        if ($this->lastError === '') $this->lastError = "Failed at $step";
        else $this->lastError = "$step: " . $this->lastError;
        fclose($fp);
        return false;
    }
}
