/**
 * K-Tix Assist Auth — Frontend
 * Pipeline: Face Detection → Landmark Mapping → Embedding Generation → 1:1 Matching
 * ID validation: Face on document + Tesseract OCR for ID-like text
 * Privacy: live video is blurred until a face is confidently detected.
 */

/* ---------- Global state ---------- */
let policiesAccepted = false;
let currentSignupStep = 1;
let faceCaptured = false;
let faceMatchScore = 0;
let faceQualityScore = 0;
let faceEmbedding = null;
let idFaceDescriptor = null;
let idFile = null;
let extractedIdInfo = null;
let pendingVerifyEmail = null;
let idStream = null;
let faceStream = null;
let idCaptureSource = 'upload';
let faceModelsLoaded = false;
let faceDetectLoop = null;
let loginFaceMode = false;
let idHasFace = false;
let idOcrScore = 0;
let idOcrText = '';

const FACE_MATCH_THRESHOLD = 0.58;
const FACE_DETECT_MIN_SCORE = 0.5;
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model';

/* ---------- UI helpers ---------- */
function showPanel(name) {
  document.querySelectorAll('.form-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  document.querySelectorAll('.auth-sidebar .nav-item[data-panel]').forEach(n => {
    n.classList.toggle('active', n.dataset.panel === name);
  });
  if (name === 'signup') nextSignupStep(1);
  if (name === 'forgot') resetForgotPanel();
  if (name !== 'login') stopLoginFace();
  ['login', 'signup', 'forgot', 'verify'].forEach(id => {
    const el = document.getElementById(id + '-alert');
    if (el) el.innerHTML = '';
  });
}

function showAlert(containerId, type, message) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', info: 'info-circle' };
  el.innerHTML = `<div class="alert alert-${type}"><i class="fas fa-${icons[type] || 'info-circle'}"></i> ${message}</div>`;
}

function setFieldError(inputId, message, extraTargetId) {
  const input = document.getElementById(inputId);
  const err = document.getElementById('err-' + inputId) || (extraTargetId ? document.getElementById(extraTargetId) : null);
  if (input) {
    input.classList.add('is-invalid');
    input.classList.remove('shake');
    void input.offsetWidth;
    input.classList.add('shake');
  }
  if (err) {
    const span = err.querySelector('span');
    if (span) span.textContent = message;
    else err.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span>${message}</span>`;
    err.classList.add('visible');
  }
}

function clearFieldError(inputId, extraTargetId) {
  const input = document.getElementById(inputId);
  const err = document.getElementById('err-' + inputId) || (extraTargetId ? document.getElementById(extraTargetId) : null);
  if (input) input.classList.remove('is-invalid', 'shake');
  if (err) {
    err.classList.remove('visible');
    const span = err.querySelector('span');
    if (span) span.textContent = '';
  }
}

function setGroupError(groupId, errId, message) {
  const group = document.getElementById(groupId);
  const err = document.getElementById(errId);
  if (group) {
    group.classList.add('is-invalid');
    group.classList.remove('shake');
    void group.offsetWidth;
    group.classList.add('shake');
  }
  if (err) {
    const span = err.querySelector('span');
    if (span) span.textContent = message;
    else err.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span>${message}</span>`;
    err.classList.add('visible');
  }
}

function clearGroupError(groupId, errId) {
  const group = document.getElementById(groupId);
  const err = document.getElementById(errId);
  if (group) group.classList.remove('is-invalid', 'shake');
  if (err) {
    err.classList.remove('visible');
    const span = err.querySelector('span');
    if (span) span.textContent = '';
  }
}

function clearAllSignupFieldErrors() {
  ['signup-name', 'signup-email', 'signup-password', 'signup-password2'].forEach(id => clearFieldError(id));
  clearGroupError('signup-policies-group', 'err-signup-policies');
  clearFieldError('id-file', 'err-id-upload');
  const upload = document.getElementById('id-upload-area');
  if (upload) upload.classList.remove('is-invalid', 'shake');
}

function clearAllLoginFieldErrors() {
  clearFieldError('login-email');
  clearFieldError('login-password');
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

async function api(action, data = {}) {
  const fd = new FormData();
  fd.append('action', action);
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null) fd.append(k, v);
  }
  const res = await fetch('/api.php', { method: 'POST', body: fd });
  return res.json();
}

/* ---------- Camera availability (required for registration) ---------- */
/**
 * Returns { ok, reason, videoCount }
 * ok: true if a video input appears available
 */
/** Standard no-camera notice (same idea as system camera error screens) */
const NO_CAMERA_TITLE = "We can't find your camera";
const NO_CAMERA_BODY =
  "Make sure the camera is connected and turned on, that anti-virus software isn't blocking it, and that the camera drivers are up to date. A working camera is required to register.";
const NO_CAMERA_CODE = '0xA00F4244&lt;NoCamerasAreAttached&gt;';
const NO_CAMERA_HTML =
  `<div class="no-camera-notice">
    <div class="no-camera-icon"><i class="fas fa-video-slash"></i></div>
    <h3>${NO_CAMERA_TITLE}</h3>
    <p>${NO_CAMERA_BODY}</p>
    <p class="no-camera-code">Here's the error code:<br><code>${NO_CAMERA_CODE}</code></p>
  </div>`;
const NO_CAMERA_ALERT =
  "We can't find your camera. Make sure the camera is connected and turned on, that anti-virus software isn't blocking it, and that the camera drivers are up to date. A working camera is required to register. Error code: 0xA00F4244&lt;NoCamerasAreAttached&gt;";

async function checkCameraAvailable() {
  // Camera APIs require a secure context (HTTPS or localhost)
  if (typeof window !== 'undefined' && !window.isSecureContext &&
      location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    return {
      ok: false,
      reason: "We can't find your camera. Camera access needs a secure connection (HTTPS). Open this site over HTTPS to register.",
      videoCount: 0
    };
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    return {
      ok: false,
      reason: NO_CAMERA_ALERT,
      videoCount: 0
    };
  }

  try {
    if (typeof navigator.mediaDevices.enumerateDevices === 'function') {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      if (videoInputs.length === 0) {
        return {
          ok: false,
          reason: NO_CAMERA_ALERT,
          videoCount: 0
        };
      }
      return { ok: true, reason: '', videoCount: videoInputs.length };
    }
  } catch (e) {
    console.warn('enumerateDevices failed', e);
  }

  // Cannot enumerate — allow attempt; getUserMedia will confirm
  return { ok: true, reason: '', videoCount: -1 };
}

function applyNoCameraUI(context) {
  showAlert('signup-alert', 'error', NO_CAMERA_ALERT);

  if (context === 'face' || context === 'signup') {
    const startBtn = document.getElementById('start-camera-btn');
    const captureBtn = document.getElementById('capture-btn');
    const submitBtn = document.getElementById('signup-submit-btn');
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.innerHTML = '<i class="fas fa-video-slash"></i> We can\'t find your camera';
    }
    if (captureBtn) {
      captureBtn.disabled = true;
      captureBtn.style.display = 'none';
    }
    if (submitBtn) submitBtn.disabled = true;
    const status = document.getElementById('face-status');
    if (status) {
      status.style.display = 'block';
      status.className = 'face-status error no-camera-status';
      status.innerHTML = NO_CAMERA_HTML;
    }
  }

  if (context === 'id' || context === 'signup') {
    const startCam = document.getElementById('id-start-cam-btn');
    if (startCam) {
      startCam.disabled = true;
      startCam.innerHTML = '<i class="fas fa-video-slash"></i> We can\'t find your camera';
    }
  }
}

/* ---------- face-api models ---------- */
async function ensureFaceModels() {
  if (faceModelsLoaded) return true;
  if (typeof faceapi === 'undefined') {
    console.error('face-api.js not loaded');
    return false;
  }
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    faceModelsLoaded = true;
    return true;
  } catch (e) {
    console.error('Model load failed', e);
    return false;
  }
}

async function runFacePipeline(input) {
  if (!faceModelsLoaded) await ensureFaceModels();
  if (!faceModelsLoaded) return { detected: false };

  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: FACE_DETECT_MIN_SCORE });
  const result = await faceapi
    .detectSingleFace(input, options)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!result) return { detected: false, score: 0 };

  return {
    detected: true,
    score: result.detection.score,
    descriptor: result.descriptor,
    landmarks: result.landmarks,
    box: result.detection.box
  };
}

function euclideanDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 999;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function matchScoreFromDistance(dist) {
  if (dist >= 1) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - dist / 1) * 100)));
}

/* ---------- Policies ---------- */
function openPolicies(e) { if (e) e.preventDefault(); document.getElementById('policies-modal').classList.add('show'); }
function closePolicies() { document.getElementById('policies-modal').classList.remove('show'); }
function acceptPolicies() {
  policiesAccepted = true;
  const b = document.getElementById('signup-policies');
  if (b) b.checked = true;
  clearGroupError('signup-policies-group', 'err-signup-policies');
  closePolicies();
}
function denyPolicies() {
  policiesAccepted = false;
  const b = document.getElementById('signup-policies');
  if (b) b.checked = false;
  closePolicies();
  showAlert('signup-alert', 'error', 'You must accept the Terms of Service & Privacy Policy to create an account.');
}
document.getElementById('policies-modal')?.addEventListener('click', function (e) {
  if (e.target === this) closePolicies();
});

/* ---------- Login (password) ---------- */
async function handleLogin(e) {
  e.preventDefault();
  clearAllLoginFieldErrors();
  const alertEl = document.getElementById('login-alert');
  if (alertEl) alertEl.innerHTML = '';

  const emailEl = document.getElementById('login-email');
  const passwordEl = document.getElementById('login-password');
  const rememberEl = document.getElementById('remember-me');
  const btn = document.getElementById('login-btn');

  const email = emailEl ? emailEl.value.trim() : '';
  const password = passwordEl ? passwordEl.value : '';
  const remember = rememberEl && rememberEl.checked ? '1' : '';
  let ok = true;

  // Red field errors for email + password only (no policies checkbox on login)
  if (!email) {
    setFieldError('login-email', 'Please enter your email address.');
    ok = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError('login-email', 'Please enter a valid email address.');
    ok = false;
  }
  if (!password) {
    setFieldError('login-password', 'Please enter your password.');
    ok = false;
  }
  if (!ok) return false;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in...';
  }

  try {
    // policies: '1' so backend allows login without a checkbox on this screen
    const data = await api('login', { email, password, remember, policies: '1' });
    if (data.ok) {
      showAlert('login-alert', 'success', data.message);
      setTimeout(() => { window.location.href = data.redirect || 'dashboard.php'; }, 600);
    } else if (data.need_verify) {
      pendingVerifyEmail = data.email;
      const disp = document.getElementById('verify-email-display');
      if (disp) disp.textContent = data.email;
      showPanel('verify');
      showAlert('verify-alert', 'warning', data.message);
    } else {
      const msg = data.message || 'Login failed.';
      showAlert('login-alert', 'error', msg);
      if (/email|password|invalid|credentials/i.test(msg)) {
        setFieldError('login-email', 'Check your email address.');
        setFieldError('login-password', msg);
      }
    }
  } catch (err) {
    showAlert('login-alert', 'error', 'Network error. Please try again.');
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
  }
  return false;
}

/* ---------- Face ID Login ---------- */
async function startLoginFace() {
  const emailEl = document.getElementById('login-email');
  const email = emailEl ? emailEl.value.trim() : '';

  if (!email) {
    setFieldError('login-email', 'Enter your email first, then use Face ID.');
    showAlert('login-alert', 'error', 'Enter your email first, then use Face ID.');
    return;
  }

  const ok = await ensureFaceModels();
  if (!ok) {
    showAlert('login-alert', 'error', 'Face models failed to load. Check your connection.');
    return;
  }

  loginFaceMode = true;
  document.getElementById('login-face-area').style.display = 'block';
  document.getElementById('login-form-fields').style.display = 'none';
  document.getElementById('login-face-status').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting camera…';

  try {
    faceStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
    });
    const video = document.getElementById('login-face-video');
    video.srcObject = faceStream;
    video.style.display = 'block';
    video.style.filter = 'blur(18px)';
    document.getElementById('login-face-guide').style.display = 'block';

    video.onloadedmetadata = () => {
      video.play();
      startLoginDetectLoop();
    };
  } catch (err) {
    showAlert('login-alert', 'error', 'Camera access denied. Allow camera or use password login.');
    stopLoginFace();
  }
}

function startLoginDetectLoop() {
  const video = document.getElementById('login-face-video');
  const status = document.getElementById('login-face-status');
  const fill = document.getElementById('login-face-fill');

  async function tick() {
    if (!loginFaceMode || !video.srcObject) return;

    const result = await runFacePipeline(video);
    if (result.detected && result.score >= FACE_DETECT_MIN_SCORE) {
      video.style.filter = 'none';
      const q = Math.round(result.score * 100);
      if (fill) fill.style.width = q + '%';
      status.className = 'face-status success';
      status.innerHTML = `<i class="fas fa-check-circle"></i> Face detected · confidence ${q}% — hold still`;
      document.getElementById('login-face-capture-btn').disabled = false;
    } else {
      video.style.filter = 'blur(18px)';
      if (fill) fill.style.width = '15%';
      status.className = 'face-status pending';
      status.innerHTML = '<i class="fas fa-eye-slash"></i> Face not recognized — center your face';
      document.getElementById('login-face-capture-btn').disabled = true;
    }
    faceDetectLoop = requestAnimationFrame(() => setTimeout(tick, 180));
  }
  tick();
}

async function captureLoginFace() {
  const video = document.getElementById('login-face-video');
  const status = document.getElementById('login-face-status');
  const email = document.getElementById('login-email').value.trim();
  const remember = document.getElementById('remember-me').checked ? '1' : '';

  status.className = 'face-status pending';
  status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> [1] Detecting → [2] Landmarks → [3] Embedding → [4] Matching…';

  const result = await runFacePipeline(video);
  if (!result.detected || !result.descriptor) {
    status.className = 'face-status error';
    status.innerHTML = '<i class="fas fa-times-circle"></i> Face not recognized. Try again.';
    video.style.filter = 'blur(18px)';
    return;
  }

  const embeddingArr = Array.from(result.descriptor);
  try {
    const data = await api('face_login', {
      email,
      face_embedding: JSON.stringify(embeddingArr),
      remember,
      policies: '1'
    });

    if (data.ok) {
      status.className = 'face-status success';
      status.innerHTML = `<i class="fas fa-check-circle"></i> Verified · match ${data.match_score || ''}%`;
      showAlert('login-alert', 'success', data.message);
      stopLoginFace();
      setTimeout(() => { window.location.href = data.redirect || 'dashboard.php'; }, 700);
    } else if (data.need_verify) {
      pendingVerifyEmail = data.email;
      document.getElementById('verify-email-display').textContent = data.email;
      showPanel('verify');
      showAlert('verify-alert', 'warning', data.message);
      stopLoginFace();
    } else {
      status.className = 'face-status error';
      status.innerHTML = `<i class="fas fa-times-circle"></i> ${data.message || 'Face not recognized'}`;
      video.style.filter = 'blur(18px)';
      showAlert('login-alert', 'error', data.message || 'Face verification failed.');
    }
  } catch (err) {
    status.className = 'face-status error';
    status.innerHTML = '<i class="fas fa-times-circle"></i> Network error';
    showAlert('login-alert', 'error', 'Network error during Face ID.');
  }
}

function stopLoginFace() {
  loginFaceMode = false;
  if (faceDetectLoop) cancelAnimationFrame(faceDetectLoop);
  faceDetectLoop = null;
  if (faceStream) {
    faceStream.getTracks().forEach(t => t.stop());
    faceStream = null;
  }
  const video = document.getElementById('login-face-video');
  if (video) {
    video.srcObject = null;
    video.style.display = 'none';
    video.style.filter = '';
  }
  const area = document.getElementById('login-face-area');
  if (area) area.style.display = 'none';
  const fields = document.getElementById('login-form-fields');
  if (fields) fields.style.display = 'block';
  const guide = document.getElementById('login-face-guide');
  if (guide) guide.style.display = 'none';
}

/* ---------- Signup steps ---------- */
function nextSignupStep(step) {
  currentSignupStep = step;
  document.querySelectorAll('.signup-step').forEach((el, i) => {
    el.style.display = (i + 1) === step ? 'block' : 'none';
  });
  document.querySelectorAll('#signup-steps .step-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i + 1 <= step);
    if (i + 1 < step) dot.classList.add('done');
    else dot.classList.remove('done');
  });
  const titles = {
    1: ['Account Details', 'Step 1 of 3 · Basic information'],
    2: ['Identity Verification', 'Step 2 of 3 · Upload or scan real ID'],
    3: ['Facial Recognition', 'Step 3 of 3 · Detect → Landmarks → Embedding → Match']
  };
  const t = titles[step];
  if (t) {
    const h = document.querySelector('#panel-signup h2');
    const s = document.querySelector('#panel-signup .subtitle');
    if (h) h.textContent = t[0];
    if (s) s.textContent = t[1];
  }
  // Clear top alert when changing steps so Terms error does not stick after step 1
  const alertEl = document.getElementById('signup-alert');
  if (alertEl) alertEl.innerHTML = '';
  if (step === 3) {
    document.getElementById('signup-submit-btn').disabled = true;
  }
}

function validateSignupStep1() {
  clearAllSignupFieldErrors();
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass = document.getElementById('signup-password').value;
  const pass2 = document.getElementById('signup-password2').value;
  const policies = document.getElementById('signup-policies').checked || policiesAccepted;
  let ok = true;

  if (!name) {
    setFieldError('signup-name', 'Please enter your full name.');
    ok = false;
  } else if (/^\d+$/.test(name.replace(/\s/g, ''))) {
    setFieldError('signup-name', 'Full name cannot be only numbers. Please enter your real name.');
    ok = false;
  } else if (!/^[a-zA-ZÀ-ÿñÑ\s.'\-]+$/.test(name)) {
    setFieldError('signup-name', 'Full name can only contain letters, spaces, hyphens, and apostrophes.');
    ok = false;
  } else if (name.trim().split(/\s+/).length < 2) {
    setFieldError('signup-name', 'Please enter your full name (first and last name).');
    ok = false;
  }
  if (!email) {
    setFieldError('signup-email', 'Please enter your email address.');
    ok = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError('signup-email', 'Please enter a valid email address.');
    ok = false;
  }
  if (!pass) {
    setFieldError('signup-password', 'Please enter a password.');
    ok = false;
  } else if (pass.length < 8) {
    setFieldError('signup-password', 'Password must be at least 8 characters.');
    ok = false;
  }
  if (!pass2) {
    setFieldError('signup-password2', 'Please confirm your password.');
    ok = false;
  } else if (pass && pass !== pass2) {
    setFieldError('signup-password2', 'Passwords do not match.');
    ok = false;
  }
  if (!policies) {
    setGroupError('signup-policies-group', 'err-signup-policies', 'You must accept the Terms of Service & Privacy Policy.');
    ok = false;
  }
  return ok;
}

function goSignupStep2() {
  if (!validateSignupStep1()) return;
  clearAllSignupFieldErrors();
  const alertEl = document.getElementById('signup-alert');
  if (alertEl) alertEl.innerHTML = '';
  nextSignupStep(2);
}

async function goSignupStep3() {
  clearFieldError('id-file', 'err-id-upload');
  const upload = document.getElementById('id-upload-area');
  if (upload) upload.classList.remove('is-invalid', 'shake');

  if (!idFile || !extractedIdInfo || !idHasFace) {
    const msg = 'Please upload or capture a clear photo of your real government ID first.';
    const err = document.getElementById('err-id-upload');
    if (err) {
      const span = err.querySelector('span');
      if (span) span.textContent = msg;
      err.classList.add('visible');
    }
    if (upload) {
      upload.classList.add('is-invalid');
      upload.classList.remove('shake');
      void upload.offsetWidth;
      upload.classList.add('shake');
    }
    showAlert('signup-alert', 'error', msg);
    return;
  }
  if (idOcrScore < 25) {
    showAlert('signup-alert', 'error', 'ID text validation failed. Upload a clearer photo of a real government ID.');
    if (upload) {
      upload.classList.add('is-invalid', 'shake');
    }
    return;
  }

  // Face verification requires a camera — block registration if none is available
  const cam = await checkCameraAvailable();
  if (!cam.ok) {
    showAlert('signup-alert', 'error', cam.reason || NO_CAMERA_ALERT);
    return;
  }

  const alertEl = document.getElementById('signup-alert');
  if (alertEl) alertEl.innerHTML = '';
  nextSignupStep(3);
  ensureFaceModels();

  // Re-check when step 3 UI is shown and lock controls if needed
  const cam2 = await checkCameraAvailable();
  if (!cam2.ok) {
    applyNoCameraUI('face');
  } else {
    // Reset start button if it was previously disabled
    const startBtn = document.getElementById('start-camera-btn');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.innerHTML = '<i class="fas fa-camera"></i> Start Camera';
    }
  }
}

/* ---------- ID type / method ---------- */
document.querySelectorAll('.id-type-option').forEach(opt => {
  opt.addEventListener('click', function () {
    document.querySelectorAll('.id-type-option').forEach(o => o.classList.remove('selected'));
    this.classList.add('selected');
    this.querySelector('input').checked = true;
  });
});

function getSelectedIdType() {
  const el = document.querySelector('input[name="id_type_choice"]:checked');
  return el ? el.value : null;
}

function setSelectedIdType(type) {
  if (!type) return;
  document.querySelectorAll('.id-type-option').forEach(o => {
    const input = o.querySelector('input');
    const match = input && input.value === type;
    o.classList.toggle('selected', match);
    if (input) input.checked = !!match;
  });
}

function switchIdMethod(method) {
  document.getElementById('tab-drop').classList.toggle('active', method === 'drop');
  document.getElementById('tab-camera').classList.toggle('active', method === 'camera');
  document.getElementById('id-method-drop').style.display = method === 'drop' ? 'block' : 'none';
  document.getElementById('id-method-camera').style.display = method === 'camera' ? 'block' : 'none';
  if (method === 'drop') stopIdCamera();
}

/**
 * Automatically detect which government ID type the OCR text most likely belongs to.
 * Returns { type, confidence } where confidence is 0–100.
 * Strong type-specific keywords beat generic "Republic of the Philippines" text
 * (which appears on almost every PH ID, including Driver's License).
 */
function detectIdTypeFromText(text) {
  if (!text || text.length < 8) {
    return { type: null, confidence: 0 };
  }
  // Normalize OCR noise: common misreads for LICENSE / DRIVER
  const t = text
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[''`´]/g, '')
    .replace(/LICEN[CS]E/g, 'LICENSE')
    .replace(/DR[I1]VER/g, 'DRIVER');

  const typeScores = {
    'Passport': 0,
    'National ID': 0,
    "Driver's License": 0,
    'PhilSys ID': 0
  };

  // ── Passport (exclusive keywords) ──
  if (t.includes('PASSPORT') || t.includes('PASSEPORT') || t.includes('TRAVEL DOCUMENT')) {
    typeScores['Passport'] += 50;
  }
  if (t.includes('P<') || /\bP[A-Z0-9]<[A-Z]{3}/.test(t)) {
    typeScores['Passport'] += 30; // MRZ
  }

  // ── Driver's License (strong priority — PH cards also say "Republic of the Philippines") ──
  if (t.includes('DRIVERS LICENSE') || t.includes('DRIVER LICENSE') || t.includes('DRIVER S LICENSE')) {
    typeScores["Driver's License"] += 60;
  }
  if (t.includes('DRIVER') && t.includes('LICENSE')) {
    typeScores["Driver's License"] += 45;
  }
  if (t.includes('DRIVER')) {
    typeScores["Driver's License"] += 25; // OCR often reads the big title word
  }
  if (t.includes('LICENSE') && !t.includes('PASSPORT')) {
    typeScores["Driver's License"] += 20;
  }
  if (t.includes('LTO') || t.includes('LAND TRANSPORTATION') || t.includes('LAND TRANSPORT')) {
    typeScores["Driver's License"] += 40;
  }
  if (t.includes('DL NO') || t.includes('DLNO') || t.includes('LICENSE NO') || t.includes('LIC NO')) {
    typeScores["Driver's License"] += 30;
  }
  // Philippine LTO license number formats: A12-34-567890, G11-24-664792, N03-12-345678, etc.
  if (/\b[A-Z]\d{2}[-\s]?\d{2}[-\s]?\d{6}\b/.test(t) || /\b[A-Z]\d{2}-\d{2}-\d{5,7}\b/.test(t)) {
    typeScores["Driver's License"] += 50;
  }
  // Restriction / conditions codes common on PH DL
  if (t.includes('RESTRICTION') || t.includes('CONDITIONS') || t.includes('BLOOD TYPE') || t.includes('AGENCY CODE')) {
    typeScores["Driver's License"] += 15;
  }

  // ── PhilSys ID ──
  if (t.includes('PHILSYS') || t.includes('PHILIPPINE IDENTIFICATION CARD') || t.includes('PHILIPPINE ID')) {
    typeScores['PhilSys ID'] += 55;
  }
  if (t.includes('PHILIPPINE IDENTIFICATION')) {
    typeScores['PhilSys ID'] += 40;
  }
  // PhilSys PCN style 4-4-4-4 digits
  if (/\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/.test(t)) {
    typeScores['PhilSys ID'] += 35;
    typeScores['National ID'] += 15;
  }

  // ── National ID (only when NOT clearly a DL / Passport) ──
  if (t.includes('NATIONAL ID') || t.includes('NATIONAL IDENTIFICATION')) {
    typeScores['National ID'] += 45;
  }
  if (t.includes('PHILIPPINE') && (t.includes('IDENTITY') || t.includes('IDENTIFICATION')) && !t.includes('DRIVER')) {
    typeScores['National ID'] += 20;
  }

  // Generic PH header — weak signal only (appears on DL, National ID, PhilSys, Passport)
  const hasStrongDl =
    typeScores["Driver's License"] >= 40 ||
    t.includes('DRIVER') ||
    t.includes('LTO') ||
    /\b[A-Z]\d{2}[-\s]?\d{2}[-\s]?\d{5,7}\b/.test(t);
  const hasStrongPassport = typeScores['Passport'] >= 40;
  if ((t.includes('REPUBLIC OF THE PHILIPPINES') || t.includes('REPUBLIKA NG PILIPINAS')) && !hasStrongDl && !hasStrongPassport) {
    typeScores['National ID'] += 12;
    typeScores['PhilSys ID'] += 8;
  }

  // Pick best
  let bestType = null;
  let bestScore = 0;
  for (const [type, score] of Object.entries(typeScores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  if (bestScore < 25) {
    return { type: null, confidence: bestScore };
  }
  return { type: bestType, confidence: Math.min(100, bestScore) };
}

/**
 * Score OCR text for overall ID-likeness (any government ID).
 * Used to reject selfies / random photos.
 */
function scoreIdOcrText(text, preferredType) {
  if (!text || text.length < 8) return 0;
  const t = text.toUpperCase().replace(/\s+/g, ' ');
  let score = 0;

  const keywords = [
    'REPUBLIC', 'PHILIPPINES', 'PHILIPPINE', 'NATIONAL', 'IDENTITY', 'IDENTIFICATION', 'PASSPORT',
    'DRIVER', 'LICENSE', 'LICENCE', 'PHILSYS', 'PHILIPPINE IDENTIFICATION',
    'DATE OF BIRTH', 'BIRTH', 'SEX', 'MALE', 'FEMALE', 'ADDRESS', 'SIGNATURE',
    'VALID', 'EXPIRY', 'EXPIRES', 'ISSUED', 'CITIZENSHIP', 'NATIONALITY',
    'SURNAME', 'GIVEN NAME', 'MIDDLE NAME', 'FULL NAME', 'ID NUMBER', 'ID NO',
    'LTO', 'TRAVEL DOCUMENT', 'REPUBLIKA', 'PILIPINAS'
  ];
  keywords.forEach(kw => {
    if (t.includes(kw)) score += 7;
  });

  // Alphanumeric sequences that look like ID numbers
  const idNumPatterns = [
    /\b[A-Z0-9]{6,20}\b/g,
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4,}\b/g,
    /\b[A-Z]{1,3}\d{6,12}\b/g,
    /\b\d{4}-\d{4}-\d{4}-\d{4}\b/g // PhilSys-style
  ];
  idNumPatterns.forEach(re => {
    const m = t.match(re);
    if (m) score += Math.min(25, m.length * 8);
  });

  // Type-specific boosts (helps when type is known / detected)
  if (preferredType === 'Passport' && (t.includes('PASSPORT') || t.includes('P<'))) score += 18;
  if (preferredType === 'National ID' && (t.includes('NATIONAL') || t.includes('PHILSYS') || t.includes('PHILIPPINE'))) score += 18;
  if (preferredType === "Driver's License" && (t.includes('DRIVER') || t.includes('LICENSE') || t.includes('LTO'))) score += 18;
  if (preferredType === 'PhilSys ID' && (t.includes('PHILSYS') || t.includes('PHILIPPINE IDENTIFICATION'))) score += 18;

  // Penalize pure selfie / almost no text
  const alphaNumLen = t.replace(/[^A-Z0-9]/g, '').length;
  if (alphaNumLen < 15) score = Math.min(score, 10);
  else if (alphaNumLen < 30) score = Math.min(score, 35);

  return Math.min(100, score);
}

function extractIdNumberFromText(text) {
  const t = text.toUpperCase().replace(/\s+/g, ' ');

  // Philippine LTO license number: e.g. G11-24-664792, N03-12-345678
  const lto = t.match(/\b[A-Z]\d{2}[-\s]?\d{2}[-\s]?\d{5,7}\b/);
  if (lto) return lto[0].replace(/\s/g, '');

  // PhilSys-style 4-4-4-4
  const philsys = t.match(/\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/);
  if (philsys) return philsys[0].replace(/\s/g, '-');

  // Prefer longer alphanumeric tokens (common on IDs)
  const candidates = t.match(/\b[A-Z0-9][-A-Z0-9]{5,18}\b/g) || [];
  if (candidates.length) {
    candidates.sort((a, b) => {
      const aMixed = /[A-Z]/.test(a) && /\d/.test(a) ? 1 : 0;
      const bMixed = /[A-Z]/.test(b) && /\d/.test(b) ? 1 : 0;
      if (bMixed !== aMixed) return bMixed - aMixed;
      return b.length - a.length;
    });
    return candidates[0].replace(/\s/g, '');
  }
  const digits = t.match(/\b\d{8,16}\b/);
  if (digits) return digits[0];
  return 'ID-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Date.now().toString().slice(-4);
}

async function processIdCanvas(canvas, sourceLabel, fileObj) {
  idFile = fileObj;
  idCaptureSource = sourceLabel === 'Camera' ? 'camera' : 'upload';
  idHasFace = false;
  idOcrScore = 0;
  idOcrText = '';
  idFaceDescriptor = null;
  extractedIdInfo = null;

  document.getElementById('id-continue-btn').disabled = true;
  document.getElementById('id-extracted').style.display = 'none';
  showAlert('signup-alert', 'info', 'Validating ID… detecting face and reading text…');

  await ensureFaceModels();

  // 1) Face must be present on the ID (rejects pure text / blank cards / selfies without ID layout)
  let faceResult = null;
  try {
    faceResult = await runFacePipeline(canvas);
  } catch (e) { /* ignore */ }

  if (!faceResult || !faceResult.detected || !faceResult.descriptor) {
    showAlert('signup-alert', 'error',
      'No face detected on this image. Point the camera at (or upload) a clear photo of a real government ID that shows the photo of the ID holder.');
    idFile = null;
    return;
  }
  idHasFace = true;
  idFaceDescriptor = faceResult.descriptor;
  const faceQ = Math.round(faceResult.score * 100);

  if (faceQ < 40) {
    showAlert('signup-alert', 'error',
      'Face on the ID is too unclear (quality ' + faceQ + '%). Use better lighting and make sure the ID photo is sharp and fully visible.');
    idFile = null;
    idHasFace = false;
    return;
  }

  // 2) OCR with Tesseract
  showAlert('signup-alert', 'info', 'Face found · reading ID text (OCR)…');
  try {
    if (typeof Tesseract !== 'undefined') {
      const { data } = await Tesseract.recognize(canvas, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text' && m.progress != null) {
            const pct = Math.round(m.progress * 100);
            if (pct % 20 === 0) {
              showAlert('signup-alert', 'info', 'Face found · reading ID text (OCR)… ' + pct + '%');
            }
          }
        }
      });
      idOcrText = (data && data.text) ? data.text : '';
    } else {
      console.warn('Tesseract.js not loaded');
      idOcrText = '';
    }
  } catch (e) {
    console.warn('OCR failed', e);
    idOcrText = '';
  }

  // 3) Automatically match / detect ID type from OCR text
  // Auto-detect ALWAYS wins when confidence is good — do not keep a wrong pre-selected type
  // (e.g. user left "National ID" selected but photo is a Driver's License)
  const detection = detectIdTypeFromText(idOcrText);
  const userSelected = getSelectedIdType();

  let idType = null;
  if (detection.type && detection.confidence >= 25) {
    idType = detection.type;
  } else if (userSelected) {
    idType = userSelected;
  } else {
    idType = 'National ID';
  }

  idOcrScore = scoreIdOcrText(idOcrText, idType);

  // Reject if document does not look like any government ID
  if (idOcrScore < 25) {
    showAlert('signup-alert', 'error',
      'This does not look like a valid government ID. Text is missing or does not match a National ID, Passport, Driver\'s License, or PhilSys ID. Please try again with a clearer photo.');
    document.getElementById('id-extracted').style.display = 'none';
    idFile = null;
    idHasFace = false;
    extractedIdInfo = null;
    return;
  }

  // Lock UI radio to the detected type
  if (detection.type && detection.confidence >= 25) {
    idType = detection.type;
    setSelectedIdType(idType);
  }

  const nameFromForm = document.getElementById('signup-name').value.trim() || 'Detected Name';
  const idNumber = extractIdNumberFromText(idOcrText) || 'Not clearly readable';

  extractedIdInfo = {
    fullName: nameFromForm,
    idNumber,
    idType,
    source: sourceLabel,
    faceQuality: faceQ,
    autoDetected: !!detection.type,
    detectionConfidence: detection.confidence || 0
  };

  document.getElementById('id-name').textContent = extractedIdInfo.fullName || '—';
  document.getElementById('id-number').textContent = extractedIdInfo.idNumber || '—';
  document.getElementById('id-type').textContent =
    (extractedIdInfo.idType ? extractedIdInfo.idType + (extractedIdInfo.autoDetected ? ' (auto-matched)' : '') : '—');
  document.getElementById('id-source').textContent = sourceLabel || '—';
  document.getElementById('id-ocr-status').innerHTML =
    `<i class="fas fa-shield-alt"></i> Face on ID · quality ${faceQ}% · document score ${idOcrScore}/100` +
    (extractedIdInfo.autoDetected ? ` · type matched automatically` : '');
  document.getElementById('id-extracted').style.display = 'block';
  document.getElementById('id-continue-btn').disabled = false;

  // Clear upload validation state on success
  clearFieldError('id-file', 'err-id-upload');
  const uploadArea = document.getElementById('id-upload-area');
  if (uploadArea) uploadArea.classList.remove('is-invalid', 'shake');

  const fnEl = document.getElementById('id-filename');
  if (fnEl && fileObj) fnEl.textContent = fileObj.name || (sourceLabel === 'Camera' ? 'Camera capture' : 'Uploaded');

  showAlert('signup-alert', 'success',
    'Valid ID accepted' + (extractedIdInfo.autoDetected ? ` · detected as <strong>${idType}</strong>` : '') +
    '. Face found on document and ID text verified. Continue to live face match.');
}

function processIdImageFile(file, sourceLabel) {
  if (!file) return;
  if (!file.type || !file.type.match(/^image\//)) {
    showAlert('signup-alert', 'error', 'Please select an image file (JPG, PNG, or WebP).');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showAlert('signup-alert', 'error', 'File too large (max 5MB). Compress or crop the photo and try again.');
    return;
  }
  const reader = new FileReader();
  reader.onload = function (ev) {
    const img = new Image();
    img.onload = function () {
      if (img.width < 200 || img.height < 120) {
        showAlert('signup-alert', 'error', 'Image is too small. Use a larger, clearer photo of your full ID.');
        return;
      }
      const canvas = document.createElement('canvas');
      const max = 1280;
      let w = img.width, h = img.height;
      if (w > max || h > max) {
        const r = Math.min(max / w, max / h);
        w = Math.round(w * r); h = Math.round(h * r);
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      processIdCanvas(canvas, sourceLabel || 'Upload', file);
    };
    img.onerror = function () {
      showAlert('signup-alert', 'error', 'Could not read this image. Try another file (JPG/PNG).');
    };
    img.src = ev.target.result;
  };
  reader.onerror = function () {
    showAlert('signup-alert', 'error', 'Failed to read the file. Please try again.');
  };
  reader.readAsDataURL(file);
}

function handleIdUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  processIdImageFile(file, 'Upload');
  // Allow re-selecting the same file later
  e.target.value = '';
}

async function startIdCamera() {
  const cam = await checkCameraAvailable();
  if (!cam.ok) {
    applyNoCameraUI('id');
    showAlert('signup-alert', 'error',
      (cam.reason || NO_CAMERA_ALERT) +
      ' You can still use <strong>Drop ID here</strong> for your ID photo, but face verification later still needs a camera to finish registration.');
    return;
  }

  try {
    stopIdCamera();
    // Prefer rear camera for document capture; fall back to any camera
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
    } catch (e1) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }
      });
    }
    idStream = stream;
    const video = document.getElementById('id-video');
    video.srcObject = idStream;
    video.style.display = 'block';
    document.getElementById('id-capture-btn').style.display = 'inline-flex';
    document.getElementById('id-start-cam-btn').style.display = 'none';
    document.getElementById('id-retake-btn').style.display = 'none';
    const preview = document.getElementById('id-preview');
    if (preview) preview.style.display = 'none';
    showAlert('signup-alert', 'info',
      'Camera ready. Point a clear government ID at the camera (face + text visible), then tap <strong>Capture ID</strong>.');
  } catch (err) {
    console.warn('ID camera error', err);
    const name = err && (err.name || '');
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      applyNoCameraUI('id');
      showAlert('signup-alert', 'error',
        NO_CAMERA_ALERT + ' You can use <strong>Drop ID here</strong> for the ID photo, but a camera is still required later for face verification.');
    } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      showAlert('signup-alert', 'error',
        "Camera permission was denied. Allow camera access in your browser, or use <strong>Drop ID here</strong> instead.");
    } else {
      showAlert('signup-alert', 'error',
        "We can't access your camera. Make sure it is connected and not blocked, or use <strong>Drop ID here</strong> instead.");
    }
  }
}

function stopIdCamera() {
  if (idStream) {
    idStream.getTracks().forEach(t => t.stop());
    idStream = null;
  }
  const video = document.getElementById('id-video');
  if (video) {
    video.srcObject = null;
    video.style.display = 'none';
  }
  const btn = document.getElementById('id-capture-btn');
  if (btn) btn.style.display = 'none';
  const startBtn = document.getElementById('id-start-cam-btn');
  if (startBtn) startBtn.style.display = 'inline-flex';
}

function captureIdPhoto() {
  const video = document.getElementById('id-video');
  const canvas = document.getElementById('id-canvas');
  if (!video || !video.videoWidth) {
    showAlert('signup-alert', 'error', 'Camera is not ready yet. Wait a moment and try again.');
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  stopIdCamera();
  const preview = document.getElementById('id-preview');
  if (preview) {
    preview.src = canvas.toDataURL('image/jpeg', 0.92);
    preview.style.display = 'block';
  }
  document.getElementById('id-retake-btn').style.display = 'inline-flex';
  document.getElementById('id-start-cam-btn').style.display = 'none';
  canvas.toBlob(function (blob) {
    if (!blob) {
      showAlert('signup-alert', 'error', 'Failed to capture image. Please try again.');
      return;
    }
    const file = new File([blob], 'id-camera-capture.jpg', { type: 'image/jpeg' });
    processIdCanvas(canvas, 'Camera', file);
  }, 'image/jpeg', 0.92);
}

function retakeIdPhoto() {
  idFile = null;
  extractedIdInfo = null;
  idHasFace = false;
  idOcrScore = 0;
  idOcrText = '';
  idFaceDescriptor = null;
  document.getElementById('id-extracted').style.display = 'none';
  document.getElementById('id-continue-btn').disabled = true;
  document.getElementById('id-retake-btn').style.display = 'none';
  const preview = document.getElementById('id-preview');
  if (preview) {
    preview.style.display = 'none';
    preview.removeAttribute('src');
  }
  const fnEl = document.getElementById('id-filename');
  if (fnEl) fnEl.textContent = '';
  startIdCamera();
}

/** Wire drag-and-drop on the upload area */
function setupIdDropZone() {
  const area = document.getElementById('id-upload-area');
  if (!area || area.dataset.dropReady === '1') return;
  area.dataset.dropReady = '1';

  ['dragenter', 'dragover'].forEach(evt => {
    area.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      area.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    area.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      area.classList.remove('dragover');
    });
  });
  area.addEventListener('drop', e => {
    const file = e.dataTransfer?.files?.[0];
    if (file) processIdImageFile(file, 'Upload');
  });
}

/* ---------- Live face capture (register) ---------- */
async function startCamera() {
  // Hard requirement: no camera → cannot register
  const cam = await checkCameraAvailable();
  if (!cam.ok) {
    applyNoCameraUI('face');
    return;
  }

  const ok = await ensureFaceModels();
  if (!ok) {
    showAlert('signup-alert', 'error', 'Face models failed to load. Check connection and retry.');
    return;
  }

  try {
    if (faceStream) faceStream.getTracks().forEach(t => t.stop());
    faceStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
    });
    const video = document.getElementById('face-video');
    video.srcObject = faceStream;
    video.style.display = 'block';
    video.style.filter = 'blur(18px)';
    document.getElementById('face-privacy-preview').style.display = 'none';
    const guide = document.getElementById('face-guide');
    if (guide) guide.style.display = 'block';
    document.getElementById('start-camera-btn').style.display = 'none';
    document.getElementById('capture-btn').style.display = 'inline-flex';
    document.getElementById('capture-btn').disabled = true;
    document.getElementById('face-status').style.display = 'inline-flex';
    document.getElementById('face-status').className = 'face-status pending';
    document.getElementById('face-status').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Align face · pipeline ready';
    document.getElementById('face-quality-bar').style.display = 'block';
    document.getElementById('face-quality-fill').style.width = '0%';

    video.onloadedmetadata = () => {
      video.play();
      startRegisterDetectLoop();
    };
  } catch (err) {
    console.warn('Face camera error', err);
    const name = err && (err.name || '');
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      applyNoCameraUI('face');
      return;
    }
    let msg = 'Camera access failed. Please allow camera permission and try again.';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      msg = 'Camera permission was denied. You must allow camera access to complete face verification and register.';
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      msg = 'Camera is in use by another app or is not readable. Close other apps using the camera and try again.';
    } else if (name === 'OverconstrainedError') {
      msg = 'Could not open camera with the required settings. Try another camera or device.';
    }
    showAlert('signup-alert', 'error', msg);
    const status = document.getElementById('face-status');
    if (status) {
      status.style.display = 'block';
      status.className = 'face-status error no-camera-status';
      status.innerHTML = NO_CAMERA_HTML;
    }
    const submitBtn = document.getElementById('signup-submit-btn');
    if (submitBtn) submitBtn.disabled = true;
  }
}

function startRegisterDetectLoop() {
  const video = document.getElementById('face-video');
  const status = document.getElementById('face-status');
  const fill = document.getElementById('face-quality-fill');
  const qLabel = document.getElementById('face-quality-label');

  async function tick() {
    if (!faceStream || !video.srcObject) return;
    if (faceCaptured) return;

    const result = await runFacePipeline(video);
    if (result.detected && result.score >= FACE_DETECT_MIN_SCORE) {
      video.style.filter = 'none';
      const q = Math.round(result.score * 100);
      if (fill) {
        fill.style.width = q + '%';
        fill.style.background = q >= 70 ? 'var(--success)' : 'var(--warning)';
      }
      if (qLabel) qLabel.innerHTML = `<span style="color:var(--success)">Face detected · ${q}% — ready to capture</span>`;
      status.className = 'face-status success';
      status.innerHTML = '<i class="fas fa-check-circle"></i> Face detected — hold still & capture';
      document.getElementById('capture-btn').disabled = false;
    } else {
      video.style.filter = 'blur(18px)';
      if (fill) { fill.style.width = '12%'; fill.style.background = 'var(--danger)'; }
      if (qLabel) qLabel.innerHTML = '<span style="color:var(--danger)">Face not recognized — center your face in the oval</span>';
      status.className = 'face-status pending';
      status.innerHTML = '<i class="fas fa-eye-slash"></i> Face not recognized';
      document.getElementById('capture-btn').disabled = true;
    }
    faceDetectLoop = requestAnimationFrame(() => setTimeout(tick, 200));
  }
  tick();
}

async function captureFace() {
  const video = document.getElementById('face-video');
  const canvas = document.getElementById('face-canvas');
  const status = document.getElementById('face-status');
  const fill = document.getElementById('face-quality-fill');
  const qLabel = document.getElementById('face-quality-label');

  if (!video.videoWidth) {
    showAlert('signup-alert', 'error', 'Camera not ready.');
    return;
  }

  status.className = 'face-status pending';
  status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> [1] Detection → [2] Landmarks → [3] Embedding → [4] Matching…';
  document.getElementById('signup-submit-btn').disabled = true;
  faceCaptured = false;
  faceEmbedding = null;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  const result = await runFacePipeline(canvas);
  if (!result.detected || !result.descriptor) {
    status.className = 'face-status error';
    status.innerHTML = '<i class="fas fa-times-circle"></i> Face not recognized. Retake.';
    if (fill) { fill.style.width = '20%'; fill.style.background = 'var(--danger)'; }
    if (qLabel) qLabel.innerHTML = '<span style="color:var(--danger)">No face found</span>';
    showAlert('signup-alert', 'error', 'Face not recognized. Center your face and try again.');
    return;
  }

  let matchDist = null;
  let matched = true;
  if (idFaceDescriptor) {
    matchDist = euclideanDistance(result.descriptor, idFaceDescriptor);
    matched = matchDist <= FACE_MATCH_THRESHOLD;
    faceMatchScore = matchScoreFromDistance(matchDist);
  } else {
    faceMatchScore = Math.round(result.score * 100);
  }

  faceQualityScore = Math.round(result.score * 100);
  faceEmbedding = Array.from(result.descriptor);

  if (!matched) {
    status.className = 'face-status error';
    status.innerHTML = `<i class="fas fa-times-circle"></i> Face does not match ID (score ${faceMatchScore}%). Retake or re-upload ID.`;
    if (fill) { fill.style.width = faceMatchScore + '%'; fill.style.background = 'var(--danger)'; }
    if (qLabel) qLabel.innerHTML = `<span style="color:var(--danger)">Match failed · distance ${matchDist?.toFixed(3)}</span>`;
    showAlert('signup-alert', 'error', 'Live face does not sufficiently match the face on your ID. Try better lighting or re-upload a clearer ID.');
    return;
  }

  if (faceStream) {
    faceStream.getTracks().forEach(t => t.stop());
    faceStream = null;
  }
  if (faceDetectLoop) cancelAnimationFrame(faceDetectLoop);
  video.style.display = 'none';
  const guide = document.getElementById('face-guide');
  if (guide) guide.style.display = 'none';
  document.getElementById('capture-btn').style.display = 'none';
  document.getElementById('face-privacy-preview').style.display = 'flex';
  document.getElementById('retake-btn').style.display = 'inline-flex';

  canvas.toBlob(function (blob) {
    window._faceFile = new File([blob], 'face-capture.jpg', { type: 'image/jpeg' });
    faceCaptured = true;

    if (fill) {
      fill.style.width = '100%';
      fill.style.background = 'var(--success)';
    }
    if (qLabel) {
      qLabel.innerHTML = `<span style="color:var(--success)">Verified · match ${faceMatchScore}% · embedding stored</span>`;
    }
    status.className = 'face-status success';
    status.innerHTML = '<i class="fas fa-check-circle"></i> Face verified & ready';
    document.getElementById('signup-submit-btn').disabled = false;
    showAlert('signup-alert', 'success', 'Facial recognition passed. You can create your account.');
  }, 'image/jpeg', 0.88);
}

function retakeFace() {
  faceCaptured = false;
  faceMatchScore = 0;
  faceQualityScore = 0;
  faceEmbedding = null;
  window._faceFile = null;
  document.getElementById('face-privacy-preview').style.display = 'none';
  document.getElementById('retake-btn').style.display = 'none';
  const ql = document.getElementById('face-quality-label');
  if (ql) ql.textContent = '';
  document.getElementById('signup-submit-btn').disabled = true;
  document.getElementById('face-status').style.display = 'none';
  document.getElementById('face-quality-bar').style.display = 'none';
  const canvas = document.getElementById('face-canvas');
  canvas.width = 1; canvas.height = 1;
  startCamera();
}

/* ---------- Create account ---------- */
async function handleSignup() {
  if (!faceCaptured || !window._faceFile || !extractedIdInfo || !idHasFace) {
    const cam = await checkCameraAvailable();
    if (!cam.ok) {
      applyNoCameraUI('face');
      return;
    }
    showAlert('signup-alert', 'error',
      'Please provide a valid ID and complete facial recognition first. A working camera is required to register.');
    return;
  }

  const btn = document.getElementById('signup-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating account...';

  try {
    const fd = new FormData();
    fd.append('action', 'signup');
    fd.append('name', document.getElementById('signup-name').value.trim());
    fd.append('email', document.getElementById('signup-email').value.trim());
    fd.append('password', document.getElementById('signup-password').value);
    fd.append('policies', '1');
    fd.append('id_number', extractedIdInfo.idNumber);
    fd.append('id_type', extractedIdInfo.idType);
    fd.append('id_face_quality', String(extractedIdInfo.faceQuality || faceQualityScore || 80));
    fd.append('face_match_score', String(faceMatchScore || 0));
    fd.append('face_verified', '1');
    fd.append('id_has_face', '1');
    fd.append('id_ocr_score', String(idOcrScore));
    fd.append('id_ocr_text', idOcrText.slice(0, 500));
    if (faceEmbedding) fd.append('face_embedding', JSON.stringify(faceEmbedding));
    if (idFile) fd.append('id_file', idFile);
    if (window._faceFile) fd.append('face_file', window._faceFile);

    const res = await fetch('/api.php', { method: 'POST', body: fd });
    const data = await res.json();

    if (data.ok) {
      pendingVerifyEmail = data.email;
      document.getElementById('verify-email-display').textContent = data.email;
      showPanel('verify');
      showAlert('verify-alert', 'success', data.message);
      idFile = null;
      idFaceDescriptor = null;
      faceCaptured = false;
      faceEmbedding = null;
      idHasFace = false;
    } else {
      showAlert('signup-alert', 'error', data.message || 'Signup failed.');
    }
  } catch (err) {
    showAlert('signup-alert', 'error', 'Network error. Please try again.');
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-user-check"></i> Create Account';
}

/* ---------- Verify / Resend / Forgot ---------- */
async function handleVerify(e) {
  e.preventDefault();
  clearFieldError('verify-code');
  const code = document.getElementById('verify-code').value.trim();
  const email = pendingVerifyEmail || document.getElementById('verify-email-display').textContent;
  if (!code) {
    setFieldError('verify-code', 'Please enter the 6-digit verification code.');
    return false;
  }
  if (!/^\d{6}$/.test(code)) {
    setFieldError('verify-code', 'Code must be exactly 6 digits.');
    return false;
  }
  try {
    const data = await api('verify', { email, code });
    if (data.ok) {
      showAlert('verify-alert', 'success', data.message);
      setTimeout(() => showPanel('login'), 1200);
    } else {
      showAlert('verify-alert', 'error', data.message);
      setFieldError('verify-code', data.message || 'Invalid code.');
    }
  } catch (err) {
    showAlert('verify-alert', 'error', 'Network error.');
  }
  return false;
}

async function resendCode() {
  const email = pendingVerifyEmail || document.getElementById('verify-email-display').textContent;
  try {
    const data = await api('resend_code', { email });
    if (data.ok) {
      showAlert('verify-alert', 'success', data.message);
    } else {
      showAlert('verify-alert', 'error', data.message);
    }
  } catch (err) {
    showAlert('verify-alert', 'error', 'Network error.');
  }
}

let pendingResetEmail = null;

function showResetPasswordForm(email) {
  pendingResetEmail = email || null;
  const forgotForm = document.getElementById('forgot-form');
  const resetForm = document.getElementById('reset-form');
  const sub = document.getElementById('forgot-subtitle');
  if (forgotForm) forgotForm.style.display = 'none';
  if (resetForm) resetForm.style.display = 'block';
  if (sub) sub.textContent = 'Enter the 6-digit code from your email and choose your new password.';
  const codeEl = document.getElementById('reset-code');
  if (codeEl) setTimeout(() => codeEl.focus(), 50);
}

function resetForgotPanel() {
  pendingResetEmail = null;
  const forgotForm = document.getElementById('forgot-form');
  const resetForm = document.getElementById('reset-form');
  const sub = document.getElementById('forgot-subtitle');
  if (forgotForm) forgotForm.style.display = 'block';
  if (resetForm) {
    resetForm.style.display = 'none';
    try { resetForm.reset(); } catch (e) { /* ignore */ }
  }
  if (sub) {
    sub.textContent = 'Enter your registered email. We will send a 6-digit code so you can set your own new password.';
  }
  ['reset-code', 'reset-password', 'reset-password2', 'forgot-email'].forEach(id => clearFieldError(id));
}

async function handleForgot(e) {
  e.preventDefault();
  clearFieldError('forgot-email');
  const alertEl = document.getElementById('forgot-alert');
  if (alertEl) alertEl.innerHTML = '';

  const emailEl = document.getElementById('forgot-email');
  const email = emailEl ? emailEl.value.trim() : '';
  const btn = document.getElementById('forgot-btn');

  if (!email) {
    setFieldError('forgot-email', 'Please enter your email address.');
    showAlert('forgot-alert', 'error', 'Please enter your email address.');
    return false;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError('forgot-email', 'Please enter a valid email address.');
    showAlert('forgot-alert', 'error', 'Please enter a valid email address.');
    return false;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending...';
  }

  try {
    const data = await api('forgot', { email });
    if (data && data.ok) {
      showAlert('forgot-alert', data.need_reset ? 'success' : 'info', data.message ||
        'If an account exists for that email, a reset code has been sent. Check your inbox and spam folder.');
      if (data.need_reset) {
        showResetPasswordForm(data.email || email);
      }
    } else {
      const msg = (data && data.message) || 'Could not send reset code. Please try again.';
      showAlert('forgot-alert', 'error', msg);
      setFieldError('forgot-email', msg);
    }
  } catch (err) {
    showAlert('forgot-alert', 'error', 'Network error. Please check your connection and try again.');
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Code';
  }
  return false;
}

async function handleResetPassword(e) {
  e.preventDefault();
  ['reset-code', 'reset-password', 'reset-password2'].forEach(id => clearFieldError(id));
  const alertEl = document.getElementById('forgot-alert');
  if (alertEl) alertEl.innerHTML = '';

  const email = (pendingResetEmail || (document.getElementById('forgot-email')?.value || '')).trim().toLowerCase();
  const code = (document.getElementById('reset-code')?.value || '').trim();
  const password = document.getElementById('reset-password')?.value || '';
  const password2 = document.getElementById('reset-password2')?.value || '';
  const btn = document.getElementById('reset-btn');
  let ok = true;

  if (!email) {
    showAlert('forgot-alert', 'error', 'Email is missing. Go back and request a new code.');
    return false;
  }
  if (!code) {
    setFieldError('reset-code', 'Please enter the 6-digit code from your email.');
    ok = false;
  } else if (!/^\d{6}$/.test(code)) {
    setFieldError('reset-code', 'Code must be exactly 6 digits.');
    ok = false;
  }
  if (!password) {
    setFieldError('reset-password', 'Please enter your new password.');
    ok = false;
  } else if (password.length < 8) {
    setFieldError('reset-password', 'Password must be at least 8 characters.');
    ok = false;
  }
  if (!password2) {
    setFieldError('reset-password2', 'Please confirm your new password.');
    ok = false;
  } else if (password !== password2) {
    setFieldError('reset-password2', 'Passwords do not match.');
    ok = false;
  }
  if (!ok) return false;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Updating...';
  }

  try {
    const data = await api('reset_password', { email, code, password, password2 });
    if (data && data.ok) {
      showAlert('forgot-alert', 'success', data.message || 'Password updated. You can sign in now.');
      setTimeout(() => {
        resetForgotPanel();
        showPanel('login');
        showAlert('login-alert', 'success', 'Password changed. Sign in with your new password.');
      }, 1200);
    } else {
      const msg = (data && data.message) || 'Could not update password.';
      showAlert('forgot-alert', 'error', msg);
      if (/code/i.test(msg)) setFieldError('reset-code', msg);
      if (/match/i.test(msg)) setFieldError('reset-password2', msg);
      else if (/password/i.test(msg)) setFieldError('reset-password', msg);
    }
  } catch (err) {
    showAlert('forgot-alert', 'error', 'Network error. Please try again.');
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-key"></i> Change Password';
  }
  return false;
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => ensureFaceModels(), 1500);
  setupIdDropZone();

  // Clear field errors as the user types / changes
  const fieldMap = [
    ['login-email', 'login-email'],
    ['login-password', 'login-password'],
    ['signup-name', 'signup-name'],
    ['signup-email', 'signup-email'],
    ['signup-password', 'signup-password'],
    ['signup-password2', 'signup-password2'],
    ['forgot-email', 'forgot-email'],
    ['reset-code', 'reset-code'],
    ['reset-password', 'reset-password'],
    ['reset-password2', 'reset-password2'],
    ['verify-code', 'verify-code']
  ];
  fieldMap.forEach(([id]) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => clearFieldError(id));
      el.addEventListener('change', () => clearFieldError(id));
    }
  });
  const polSignup = document.getElementById('signup-policies');
  if (polSignup) polSignup.addEventListener('change', () => clearGroupError('signup-policies-group', 'err-signup-policies'));
});
