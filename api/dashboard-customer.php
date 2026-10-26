<?php
require_once __DIR__ . '/includes/config.php';
$user = requireAuth('customer');
$full = findUserById((int)$user['id']);
$hasFace = !empty($full['face_embedding']);
$idType = $full['id_type'] ?? '—';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>K-Tix Assist | My Account</title>
  <link rel="stylesheet" href="css/styles.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
</head>
<body>
  <div class="dashboard-wrapper">
    <aside class="dashboard-sidebar">
      <div class="logo">
        <div class="logo-icon"><i class="fas fa-ticket-alt"></i></div>
        <div class="logo-text">
          <h1>K-Tix Assist</h1>
          <p>Customer Portal</p>
        </div>
      </div>
      <nav>
        <div class="nav-label">Main</div>
        <a href="dashboard-customer.php" class="nav-item active"><i class="fas fa-home"></i> Home</a>
        <a href="#" class="nav-item"><i class="fas fa-ticket-alt"></i> My Tickets</a>
        <a href="#" class="nav-item"><i class="fas fa-music"></i> Browse Concerts</a>
        <div class="nav-label">Account</div>
        <a href="#" class="nav-item"><i class="fas fa-user"></i> Profile</a>
        <a href="#" class="nav-item"><i class="fas fa-fingerprint"></i> Face ID</a>
      </nav>
    </aside>

    <main class="dashboard-main">
      <header class="dashboard-topbar">
        <div>
          <div class="page-title">K-TIX ASSIST</div>
          <h1>Welcome, <?= htmlspecialchars(explode(' ', $user['name'])[0]) ?></h1>
        </div>
        <div class="user-menu">
          <i class="fas fa-user-circle" style="color:var(--primary-blue)"></i>
          <span><?= htmlspecialchars($user['name']) ?> (Customer)</span>
          <button class="logout-btn" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Logout</button>
        </div>
      </header>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="icon-wrap"><i class="fas fa-ticket-alt"></i></div>
          <div class="value">0</div>
          <div class="label">My Tickets</div>
          <a href="#" class="link">View tickets →</a>
        </div>
        <div class="stat-card">
          <div class="icon-wrap" style="background:#ede9fe;color:#7c3aed;"><i class="fas fa-fingerprint"></i></div>
          <div class="value"><?= $hasFace ? 'On' : 'Off' ?></div>
          <div class="label">Face ID</div>
          <a href="#" class="link"><?= $hasFace ? 'Managed →' : 'Enroll →' ?></a>
        </div>
        <div class="stat-card">
          <div class="icon-wrap" style="background:#dbeafe;color:#2563eb;"><i class="fas fa-id-card"></i></div>
          <div class="value" style="font-size:1.1rem;"><?= htmlspecialchars($idType) ?></div>
          <div class="label">Verified ID</div>
        </div>
        <div class="stat-card">
          <div class="icon-wrap" style="background:#d1fae5;color:#059669;"><i class="fas fa-music"></i></div>
          <div class="value">—</div>
          <div class="label">Upcoming Events</div>
          <a href="#" class="link">Browse →</a>
        </div>
      </div>

      <div style="padding:0 1.75rem 1.75rem;">
        <div class="stat-card">
          <h3 style="font-size:1.1rem; font-weight:600; margin-bottom:0.5rem;">Account security</h3>
          <ul style="font-size:0.9rem; color:var(--text-muted); line-height:1.9; list-style:none;">
            <li><i class="fas fa-check-circle" style="color:var(--success)"></i> Email verified</li>
            <li>
              <?php if ($hasFace): ?>
                <i class="fas fa-check-circle" style="color:var(--success)"></i> Face ID enrolled — you can sign in with Face ID
              <?php else: ?>
                <i class="fas fa-info-circle" style="color:var(--warning)"></i> Face ID not enrolled
              <?php endif; ?>
            </li>
            <li><i class="fas fa-shield-alt" style="color:var(--primary-blue)"></i> Privacy: live camera is blurred until your face is recognized</li>
          </ul>
        </div>
      </div>
    </main>
  </div>
  <script>
    async function logout() {
      await fetch('/api.php', { method: 'POST', body: new URLSearchParams({ action: 'logout' }) });
      window.location.href = '/';
    }
  </script>
</body>
</html>
