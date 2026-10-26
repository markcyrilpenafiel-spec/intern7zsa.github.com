<?php
require_once __DIR__ . '/includes/config.php';
if (isLoggedIn()) {
    $u = findUserById((int)$_SESSION['user_id']);
    header('Location: ' . roleDashboard($u['role'] ?? 'customer'));
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>K-Tix Assist | Login</title>
  <link rel="stylesheet" href="css/styles.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
</head>
<body>
 

    <main class="auth-main">
      <header class="auth-header">
        <div class="brand">K-TIX ASSIST</div>
        <div class="user-badge">
          <i class="fas fa-shield-alt" style="color:var(--primary-blue)"></i>
          Secure Portal
        </div>
      </header>

      <div class="auth-content">
        <div class="auth-card">

          <!-- LOGIN -->
          <div id="panel-login" class="form-panel active">
            <h2>LOGIN</h2>
            <p class="subtitle">Sign in to your K-Tix Assist account</p>
            <div id="login-alert"></div>
            <form id="login-form" onsubmit="return handleLogin(event)" novalidate>
              <div id="login-form-fields">
                <div class="form-group">
                  <label>Email Address <span class="required">*</span></label>
                  <input type="email" class="form-control" id="login-email" placeholder="you@example.com" autocomplete="email">
                  <div class="field-error" id="err-login-email"><i class="fas fa-exclamation-circle"></i> <span></span></div>
                </div>
                <div class="form-group">
                  <label>Password <span class="required">*</span></label>
                  <div class="input-with-icon">
                    <input type="password" class="form-control" id="login-password" placeholder="••••••••" autocomplete="current-password">
                    <button type="button" class="toggle-password" onclick="togglePassword('login-password', this)"><i class="fas fa-eye"></i></button>
                  </div>
                  <div class="field-error" id="err-login-password"><i class="fas fa-exclamation-circle"></i> <span></span></div>
                </div>
                <div class="checkbox-group">
                  <input type="checkbox" id="remember-me">
                  <label for="remember-me">Remember me</label>
                </div>
                <div class="checkbox-group" id="login-policies-group">
                  <input type="checkbox" id="accept-policies">
                  <label for="accept-policies">I accept the <a href="#" onclick="openPolicies(event)">Terms of Service & Privacy Policy</a></label>
                </div>
                <div class="field-error" id="err-login-policies"><i class="fas fa-exclamation-circle"></i> <span></span></div>
                <button type="submit" class="btn btn-primary" id="login-btn"><i class="fas fa-sign-in-alt"></i> Sign In</button>
              </div>
            </form>
            <div class="auth-links">
              <a href="#" onclick="showPanel('forgot'); return false;">Forgot password?</a>
              &nbsp;·&nbsp;
              <a href="#" onclick="showPanel('signup'); return false;">Create account</a>
            </div>
          </div>

          <!-- SIGNUP -->
          <div id="panel-signup" class="form-panel">
            <button class="back-btn" onclick="showPanel('login')"><i class="fas fa-arrow-left"></i> Back</button>
            <div class="steps" id="signup-steps">
              <div class="step-dot active" data-step="1"></div>
              <div class="step-dot" data-step="2"></div>
              <div class="step-dot" data-step="3"></div>
            </div>
            <h2 id="signup-title">Create Account</h2>
            <p class="subtitle" id="signup-subtitle">Step 1 of 3 · Your details</p>
            <div id="signup-alert"></div>

            <!-- Step 1 -->
            <div id="signup-step-1" class="signup-step">
              <div class="form-group">
                <label>Full Name <span class="required">*</span></label>
                <input type="text" class="form-control" id="signup-name" placeholder="Juan Dela Cruz" autocomplete="name">
                <div class="field-error" id="err-signup-name"><i class="fas fa-exclamation-circle"></i> <span></span></div>
              </div>
              <div class="form-group">
                <label>Email Address <span class="required">*</span></label>
                <input type="email" class="form-control" id="signup-email" placeholder="you@example.com" autocomplete="email">
                <div class="field-error" id="err-signup-email"><i class="fas fa-exclamation-circle"></i> <span></span></div>
              </div>
              <div class="form-group">
                <label>Password <span class="required">*</span></label>
                <div class="input-with-icon">
                  <input type="password" class="form-control" id="signup-password" placeholder="Min. 8 characters" autocomplete="new-password">
                  <button type="button" class="toggle-password" onclick="togglePassword('signup-password', this)"><i class="fas fa-eye"></i></button>
                </div>
                <div class="field-error" id="err-signup-password"><i class="fas fa-exclamation-circle"></i> <span></span></div>
              </div>
              <div class="form-group">
                <label>Confirm Password <span class="required">*</span></label>
                <input type="password" class="form-control" id="signup-password2" placeholder="Re-enter password" autocomplete="new-password">
                <div class="field-error" id="err-signup-password2"><i class="fas fa-exclamation-circle"></i> <span></span></div>
              </div>
              <div class="checkbox-group" id="signup-policies-group">
                <input type="checkbox" id="signup-policies">
                <label for="signup-policies">I accept the <a href="#" onclick="openPolicies(event)">Terms of Service & Privacy Policy</a>. <strong>Denying prevents account creation.</strong></label>
              </div>
              <div class="field-error" id="err-signup-policies"><i class="fas fa-exclamation-circle"></i> <span></span></div>
              <button type="button" class="btn btn-primary" onclick="goSignupStep2()">Continue <i class="fas fa-arrow-right"></i></button>
            </div>

            <!-- Step 2: Valid ID -->
            <div id="signup-step-2" class="signup-step" style="display:none;">
              <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:1rem; text-align:center;">
                Select your ID type, then upload or capture a clear photo of your <strong>real government ID</strong>. Selfies and non-ID images will be rejected.
              </p>

              <div class="form-group">
                <label>Valid ID Type <span class="required">*</span></label>
                <div class="id-type-grid" id="id-type-grid">
                  <label class="id-type-option selected">
                    <input type="radio" name="id_type_choice" value="National ID" checked>
                    <i class="fas fa-id-card"></i>
                    <span>National ID</span>
                  </label>
                  <label class="id-type-option">
                    <input type="radio" name="id_type_choice" value="Passport">
                    <i class="fas fa-passport"></i>
                    <span>Passport</span>
                  </label>
                  <label class="id-type-option">
                    <input type="radio" name="id_type_choice" value="Driver's License">
                    <i class="fas fa-car"></i>
                    <span>Driver's License</span>
                  </label>
                  <label class="id-type-option">
                    <input type="radio" name="id_type_choice" value="PhilSys ID">
                    <i class="fas fa-address-card"></i>
                    <span>PhilSys ID</span>
                  </label>
                </div>
              </div>

              <div class="capture-method-tabs">
                <button type="button" class="method-tab active" id="tab-drop" onclick="switchIdMethod('drop')">
                  <i class="fas fa-cloud-upload-alt"></i> Drop ID here
                </button>
                <button type="button" class="method-tab" id="tab-camera" onclick="switchIdMethod('camera')">
                  <i class="fas fa-camera"></i> Use camera
                </button>
              </div>

              <div id="id-method-drop">
                <div class="file-upload" id="id-upload-area" onclick="document.getElementById('id-file').click()">
                  <div class="icon"><i class="fas fa-id-card"></i></div>
                  <p>Drop your ID here or click to browse</p>
                  <p style="font-size:0.8rem; margin-top:4px;">JPG or PNG · Max 5MB · Must show face + text</p>
                  <div class="filename" id="id-filename"></div>
                  <input type="file" id="id-file" accept="image/jpeg,image/png,image/webp" onchange="handleIdUpload(event)">
                </div>
                <div class="field-error" id="err-id-upload"><i class="fas fa-exclamation-circle"></i> <span></span></div>
              </div>

              <div id="id-method-camera" style="display:none;">
                <div class="face-capture">
                  <div style="position:relative; max-width:320px; margin:0 auto 1rem;">
                    <video id="id-video" autoplay playsinline style="display:none; width:100%; border-radius:8px; background:#000;"></video>
                    <canvas id="id-canvas" style="display:none;"></canvas>
                    <img id="id-preview" style="display:none; width:100%; border-radius:8px;">
                  </div>
                  <div class="controls">
                    <button type="button" class="btn btn-outline btn-sm" id="id-start-cam-btn" onclick="startIdCamera()">
                      <i class="fas fa-camera"></i> Open Camera
                    </button>
                    <button type="button" class="btn btn-primary btn-sm" id="id-capture-btn" onclick="captureIdPhoto()" style="display:none;">
                      <i class="fas fa-camera-retro"></i> Capture ID
                    </button>
                    <button type="button" class="btn btn-outline btn-sm" id="id-retake-btn" onclick="retakeIdPhoto()" style="display:none;">
                      <i class="fas fa-redo"></i> Retake
                    </button>
                  </div>
                </div>
              </div>

              <div id="id-extracted" class="id-extracted-card" style="display:none;">
                <p style="font-size:0.9rem; font-weight:600; margin-bottom:0.75rem; color:#6ee7b7;"><i class="fas fa-check-circle"></i> ID validated</p>
                <div class="id-meta">
                  <div><span>Full Name:</span><strong id="id-name">—</strong></div>
                  <div><span>ID Number:</span><strong id="id-number">—</strong></div>
                  <div><span>Type:</span><strong id="id-type">—</strong></div>
                  <div><span>Source:</span><strong id="id-source">—</strong></div>
                </div>
                <p id="id-ocr-status" style="font-size:0.8rem; color:var(--text-muted); margin-top:0.75rem;"></p>
              </div>

              <div style="display:flex; gap:10px; margin-top:1.25rem;">
                <button type="button" class="btn btn-outline" onclick="nextSignupStep(1)" style="width:auto;"><i class="fas fa-arrow-left"></i> Back</button>
                <button type="button" class="btn btn-primary" id="id-continue-btn" onclick="goSignupStep3()" disabled>Continue <i class="fas fa-arrow-right"></i></button>
              </div>
            </div>

            <!-- Step 3: Facial Recognition -->
            <div id="signup-step-3" class="signup-step" style="display:none;">
              <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:1rem; text-align:center;">
                Facial validation: Detection → Landmarks → Embedding → 1:1 match to your ID. Video stays blurred until your face is recognized.
              </p>
              <div class="face-capture">
                <div style="position:relative; max-width:280px; margin:0 auto 1rem;">
                  <video id="face-video" autoplay playsinline style="display:none; width:100%; border-radius:8px; background:#000;"></video>
                  <canvas id="face-canvas" style="display:none;"></canvas>
                  <div id="face-privacy-preview" style="display:none; width:100%; aspect-ratio:4/3; border-radius:8px; background:linear-gradient(135deg,#1e293b,#334155); align-items:center; justify-content:center; flex-direction:column; color:white;">
                    <i class="fas fa-user-shield" style="font-size:3rem; margin-bottom:0.5rem; opacity:0.9;"></i>
                    <span style="font-size:0.85rem;">Face captured · Privacy protected</span>
                  </div>
                  <div id="face-guide" style="display:none; position:absolute; inset:0; pointer-events:none; border-radius:8px; overflow:hidden;">
                    <div style="position:absolute; left:50%; top:45%; transform:translate(-50%,-50%); width:55%; height:70%; border:2px solid rgba(255,255,255,0.7); border-radius:50%; box-shadow:0 0 0 9999px rgba(0,0,0,0.35);"></div>
                  </div>
                </div>
                <div class="controls">
                  <button type="button" class="btn btn-outline btn-sm" id="start-camera-btn" onclick="startCamera()"><i class="fas fa-camera"></i> Start Camera</button>
                  <button type="button" class="btn btn-primary btn-sm" id="capture-btn" onclick="captureFace()" style="display:none;"><i class="fas fa-camera-retro"></i> Capture Face</button>
                  <button type="button" class="btn btn-outline btn-sm" id="retake-btn" onclick="retakeFace()" style="display:none;"><i class="fas fa-redo"></i> Retake</button>
                </div>
                <div id="face-status" class="face-status pending" style="display:none;"><i class="fas fa-spinner fa-spin"></i> Awaiting capture...</div>
                <div id="face-quality-bar" style="display:none; margin-top:0.75rem; max-width:280px; margin-left:auto; margin-right:auto;">
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">Face capture</div>
                  <div style="height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                    <div id="face-quality-fill" style="height:100%; width:0%; background:var(--warning); transition:width 0.4s, background 0.4s;"></div>
                  </div>
                  <div id="face-quality-label" style="font-size:0.75rem; margin-top:4px; color:var(--text-muted);"></div>
                </div>
              </div>
              <div style="display:flex; gap:10px; margin-top:1.25rem;">
                <button type="button" class="btn btn-outline" onclick="nextSignupStep(2)" style="width:auto;"><i class="fas fa-arrow-left"></i> Back</button>
                <button type="button" class="btn btn-primary" id="signup-submit-btn" onclick="handleSignup()" disabled><i class="fas fa-user-check"></i> Create Account</button>
              </div>
            </div>
          </div>

          <!-- FORGOT -->
          <div id="panel-forgot" class="form-panel">
            <button class="back-btn" onclick="showPanel('login')"><i class="fas fa-arrow-left"></i> Back</button>
            <h2>Reset Password</h2>
            <p class="subtitle">Enter your registered email address and we'll send you a link to reset your password.</p>
            <div id="forgot-alert"></div>
            <form id="forgot-form" onsubmit="return handleForgot(event)" novalidate>
              <div class="form-group">
                <label>Email Address <span class="required">*</span></label>
                <input type="email" class="form-control" id="forgot-email" placeholder="you@example.com" autocomplete="email">
                <div class="field-error" id="err-forgot-email"><i class="fas fa-exclamation-circle"></i> <span></span></div>
              </div>
              <button type="submit" class="btn btn-primary" id="forgot-btn"><i class="fas fa-paper-plane"></i> Send Temporary Password</button>
            </form>
            <div class="auth-links"><a href="#" onclick="showPanel('login'); return false;">Back to Login</a></div>
          </div>

          <!-- VERIFY -->
          <div id="panel-verify" class="form-panel">
            <h2>Verify Your Email</h2>
            <p class="subtitle">We sent a 6-digit code to your email inbox</p>
            <div id="verify-alert"></div>
            <div class="alert alert-info">
              <i class="fas fa-envelope"></i>
              <span>Code sent to <strong id="verify-email-display"></strong></span>
            </div>
            <form id="verify-form" onsubmit="return handleVerify(event)" novalidate>
              <div class="form-group">
                <label>Verification Code <span class="required">*</span></label>
                <input type="text" class="form-control" id="verify-code" placeholder="6-digit code" maxlength="6" inputmode="numeric" style="text-align:center; letter-spacing:0.3em; font-size:1.25rem;">
                <div class="field-error" id="err-verify-code"><i class="fas fa-exclamation-circle"></i> <span></span></div>
              </div>
              <button type="submit" class="btn btn-primary"><i class="fas fa-check-circle"></i> Verify Email</button>
            </form>
            <div class="auth-links">
              <a href="#" onclick="resendCode(); return false;">Resend code</a>
              &nbsp;·&nbsp;
              <a href="#" onclick="showPanel('login'); return false;">Back to Login</a>
            </div>
          </div>

        </div>
      </div>
    </main>
  </div>

  <!-- Policies Modal -->
  <div class="modal-overlay" id="policies-modal">
    <div class="modal">
      <div class="modal-header">
        <h3>Terms of Service & Privacy Policy</h3>
        <button class="modal-close" onclick="closePolicies()">&times;</button>
      </div>
      <div class="modal-body">
        <h4>1. Acceptance of Terms</h4>
        <p>By creating an account or logging into K-Tix Assist, you agree to these Terms. If you do not accept them, you may not use the service.</p>
        <h4>2. Account Registration</h4>
        <p>You must provide accurate information including a valid government-issued ID and complete facial recognition. Accounts may be suspended for false information.</p>
        <h4>3. Privacy & Data</h4>
        <p>We collect name, email, ID documents, and facial biometric data solely for identity verification. Data is encrypted at rest. Raw face images are not retained after validation beyond the stored capture for audit.</p>
        <h4>4. Facial Recognition</h4>
        <p>Facial data is processed for matching against your ID. You may request deletion of biometric data by contacting support.</p>
        <h4>5. Email Communications</h4>
        <p>You consent to receive transactional emails (verification, password resets, ticket confirmations).</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline btn-sm" onclick="denyPolicies()">Deny</button>
        <button class="btn btn-primary btn-sm" onclick="acceptPolicies()">Accept</button>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/dist/face-api.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
