<?php
require_once __DIR__ . '/includes/config.php';
$user = requireAuth('admin');

$all = getUsers();
$customers = count(array_filter($all, fn($u) => ($u['role'] ?? '') === 'customer'));
$staffCount = count(array_filter($all, fn($u) => in_array($u['role'] ?? '', ['admin', 'staff'], true)));
$faceEnrolled = count(array_filter($all, fn($u) => !empty($u['face_embedding'])));
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>K-Tix Assist | Admin Dashboard</title>
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
          <p>Admin Panel</p>
        </div>
      </div>
      <nav>
        <div class="nav-label">Main</div>
        <a href="dashboard-admin.php" class="nav-item active"><i class="fas fa-th-large"></i> Dashboard</a>
        <div class="nav-label">Management</div>
        <a href="#" class="nav-item"><i class="fas fa-users"></i> User Management</a>
        <a href="#" class="nav-item"><i class="fas fa-user-tie"></i> Staff Management</a>
        <a href="#" class="nav-item"><i class="fas fa-building"></i> Company Management</a>
        <a href="#" class="nav-item"><i class="fas fa-music"></i> Concerts & Tickets</a>
        <a href="#" class="nav-item"><i class="fas fa-ticket-alt"></i> Ticket Stock</a>
        <div class="nav-label">Monitoring</div>
        <a href="#" class="nav-item"><i class="fas fa-exchange-alt"></i> Transactions</a>
        <a href="#" class="nav-item"><i class="fas fa-chart-bar"></i> Reports</a>
        <a href="#" class="nav-item"><i class="fas fa-shield-alt"></i> Audit Logs</a>
        <a href="#" class="nav-item"><i class="fas fa-fingerprint"></i> Face Profiles</a>
      </nav>
    </aside>

    <main class="dashboard-main">
      <header class="dashboard-topbar">
        <div>
          <div class="page-title">K-TIX ASSIST</div>
          <h1>Admin Dashboard</h1>
        </div>
        <div class="user-menu">
          <i class="fas fa-user-shield" style="color:var(--accent-purple)"></i>
          <span><?= htmlspecialchars($user['name']) ?> (Admin)</span>
          <button class="logout-btn" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Logout</button>
        </div>
      </header>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="icon-wrap"><i class="fas fa-user"></i></div>
          <div class="value"><?= $customers ?></div>
          <div class="label">Customer Accounts</div>
          <a href="#" class="link">Manage Customers →</a>
        </div>
        <div class="stat-card">
          <div class="icon-wrap"><i class="fas fa-users"></i></div>
          <div class="value"><?= $staffCount ?></div>
          <div class="label">Staff & Admin</div>
          <a href="#" class="link">Manage Staff →</a>
        </div>
        <div class="stat-card">
          <div class="icon-wrap" style="background:#ede9fe;color:#7c3aed;"><i class="fas fa-fingerprint"></i></div>
          <div class="value"><?= $faceEnrolled ?></div>
          <div class="label">Face ID Enrolled</div>
          <a href="#" class="link">View Profiles →</a>
        </div>
        <div class="stat-card">
          <div class="icon-wrap" style="background:#fef3c7;color:#d97706;"><i class="fas fa-ticket-alt"></i></div>
          <div class="value">800</div>
          <div class="label">Total Ticket Stock</div>
          <a href="#" class="link">Manage Tickets →</a>
        </div>
        <div class="stat-card">
          <div class="icon-wrap" style="background:#dbeafe;color:#2563eb;"><i class="fas fa-credit-card"></i></div>
          <div class="value">0</div>
          <div class="label">Transactions</div>
          <a href="#" class="link">View Transactions →</a>
        </div>
        <div class="stat-card">
          <div class="icon-wrap" style="background:#d1fae5;color:#059669;"><i class="fas fa-peso-sign"></i></div>
          <div class="value">₱0.00</div>
          <div class="label">Completed Sales</div>
          <a href="#" class="link">View Reports →</a>
        </div>
      </div>

      <div style="padding:0 1.75rem 1.75rem; display:grid; grid-template-columns:1fr 1fr; gap:1.25rem;">
        <div class="stat-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <div>
              <h3 style="font-size:1.1rem; font-weight:600;">Upcoming Concerts</h3>
              <p style="font-size:0.85rem; color:var(--text-muted);">Scheduled events</p>
            </div>
            <button class="btn btn-primary btn-sm">Manage</button>
          </div>
          <p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding:2rem 0;">No upcoming concerts yet.</p>
        </div>
        <div class="stat-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <div>
              <h3 style="font-size:1.1rem; font-weight:600;">System Status</h3>
              <p style="font-size:0.85rem; color:var(--text-muted);">Auth & biometrics</p>
            </div>
          </div>
          <ul style="font-size:0.9rem; color:var(--text-muted); line-height:1.8; list-style:none;">
            <li><i class="fas fa-check-circle" style="color:var(--success)"></i> Password login active</li>
            <li><i class="fas fa-check-circle" style="color:var(--success)"></i> Face ID (1:1) active · threshold 0.58</li>
            <li><i class="fas fa-check-circle" style="color:var(--success)"></i> Email verification codes</li>
            <li><i class="fas fa-check-circle" style="color:var(--success)"></i> Privacy blur on unrecognized faces</li>
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
