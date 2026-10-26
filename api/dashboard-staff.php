<?php
require_once __DIR__ . '/includes/config.php';
$user = requireAuth('staff');

$all = getUsers();
$customers = count(array_filter($all, fn($u) => ($u['role'] ?? '') === 'customer'));
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>K-Tix Assist | Staff Dashboard</title>
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
          <p>Staff Portal</p>
        </div>
      </div>
      <nav>
        <div class="nav-label">Main</div>
        <a href="dashboard-staff.php" class="nav-item active"><i class="fas fa-th-large"></i> Dashboard</a>
        <div class="nav-label">Operations</div>
        <a href="#" class="nav-item"><i class="fas fa-ticket-alt"></i> Ticket Sales</a>
        <a href="#" class="nav-item"><i class="fas fa-qrcode"></i> Scan Tickets</a>
        <a href="#" class="nav-item"><i class="fas fa-users"></i> Customers</a>
        <a href="#" class="nav-item"><i class="fas fa-music"></i> Concerts</a>
        <div class="nav-label">Support</div>
        <a href="#" class="nav-item"><i class="fas fa-headset"></i> Help Desk</a>
      </nav>
    </aside>

    <main class="dashboard-main">
      <header class="dashboard-topbar">
        <div>
          <div class="page-title">K-TIX ASSIST</div>
          <h1>Staff Dashboard</h1>
        </div>
        <div class="user-menu">
          <i class="fas fa-user-tie" style="color:var(--primary-blue)"></i>
          <span><?= htmlspecialchars($user['name']) ?> (Staff)</span>
          <button class="logout-btn" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Logout</button>
        </div>
      </header>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="icon-wrap"><i class="fas fa-user"></i></div>
          <div class="value"><?= $customers ?></div>
          <div class="label">Customers</div>
          <a href="#" class="link">View list →</a>
        </div>
        <div class="stat-card">
          <div class="icon-wrap" style="background:#fef3c7;color:#d97706;"><i class="fas fa-ticket-alt"></i></div>
          <div class="value">800</div>
          <div class="label">Tickets Available</div>
          <a href="#" class="link">Sell tickets →</a>
        </div>
        <div class="stat-card">
          <div class="icon-wrap" style="background:#dbeafe;color:#2563eb;"><i class="fas fa-qrcode"></i></div>
          <div class="value">0</div>
          <div class="label">Scanned Today</div>
          <a href="#" class="link">Open scanner →</a>
        </div>
        <div class="stat-card">
          <div class="icon-wrap" style="background:#d1fae5;color:#059669;"><i class="fas fa-check-circle"></i></div>
          <div class="value">0</div>
          <div class="label">Sales Today</div>
          <a href="#" class="link">View sales →</a>
        </div>
      </div>

      <div style="padding:0 1.75rem 1.75rem;">
        <div class="stat-card">
          <h3 style="font-size:1.1rem; font-weight:600; margin-bottom:0.5rem;">Quick Actions</h3>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">Common staff tasks</p>
          <div style="display:flex; flex-wrap:wrap; gap:0.75rem;">
            <button class="btn btn-primary btn-sm"><i class="fas fa-plus"></i> New Sale</button>
            <button class="btn btn-outline btn-sm"><i class="fas fa-qrcode"></i> Scan Ticket</button>
            <button class="btn btn-outline btn-sm"><i class="fas fa-search"></i> Find Customer</button>
          </div>
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
