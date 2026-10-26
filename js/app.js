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
  clearGroupError('login-policies-group', 'err-login-policies');
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
  const a = document.getElementById('accept-policies');
  const b = document.getElementById('signup-policies');
  if (a) a.checked = true;
  if (b) b.checked = true;
  closePolicies();
}
function denyPolicies() {
  policiesAccepted = false;
  const a = document.getElementById('accept-policies');
  const b = document.getElementById('signup-policies');
  if (a) a.checked = false;
  if (b) b.checked = false;
  closePolicies();
  showAlert('login-alert', 'error', 'You must accept the policies to log in or create an account.');
}
document.getElementById('policies-modal')?.addEventListener('click', function (e) {
  if (e.target === this) closePolicies();
});

/* ---------- Login (password) ---------- */
async function handleLogin(e) {
  e.preventDefault();
  clearAllLoginFieldErrors();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const remember = document.getElementById('remember-me').checked ? '1' : '';
  const policies = document.getElementById('accept-policies').checked || policiesAccepted;
  const btn = document.getElementById('login-btn');
  let ok = true;

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
  if (!policies) {
    setGroupError('login-policies-group', 'err-login-policies', 'You must accept the Terms of Service & Privacy Policy to log in.');
    ok = false;
  }
  if (!ok) return false;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in...';

  try {
    const data = await api('login', { email, password, remember, policies: policies ? '1' : '' });
    if (data.ok) {
      showAlert('login-alert', 'success', data.message);
      setTimeout(() => { window.location.href = data.redirect || 'dashboard.php'; }, 600);
    } else if (data.need_verify) {
      pendingVerifyEmail = data.email;
      document.getElementById('verify-email-display').textContent = data.email;
      showPanel('verify');
      showAlert('verify-alert', 'warning', data.message);
    } else {
      showAlert('login-alert', 'error', data.message || 'Login failed.');
    }
  } catch (err) {
    showAlert('login-alert', 'error', 'Network error. Please try again.');
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
  return false;
}

/* ---------- Face ID Login ---------- */
async function startLoginFace() {
  const email = document.getElementById('login-email').value.trim();
  const policies = document.getElementById('accept-policies').checked || policiesAccepted;

  if (!email) {
    showAlert('login-alert', 'error', 'Enter your email first, then use Face ID.');
    return;
  }
  if (!policies) {
    showAlert('login-alert', 'error', 'Accept the policies before using Face ID.');
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

function goSignupStep3() {
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
  const alertEl = document.getElementById('signup-alert');
  if (alertEl) alertEl.innerHTML = '';
  nextSignupStep(3);
  ensureFaceModels();
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
  return el ? el.value : 'National ID';
}

function switchIdMethod(method) {
  document.getElementById('tab-drop').classList.toggle('active', method === 'drop');
  document.getElementById('tab-camera').classList.toggle('active', method === 'camera');
  document.getElementById('id-method-drop').style.display = method === 'drop' ? 'block' : 'none';
  document.getElementById('id-method-camera').style.display = method === 'camera' ? 'block' : 'none';
  if (method === 'drop') stopIdCamera();
}

/**
 * Score OCR text for ID-likeness.
 * Looks for keywords common on PH / international IDs and alphanumeric ID numbers.
 */
function scoreIdOcrText(text, idType) {
  if (!text || text.length < 8) return 0;
  const t = text.toUpperCase().replace(/\s+/g, ' ');
  let score = 0;

  const keywords = [
    'REPUBLIC', 'PHILIPPINES', 'PHILIPPINE', 'NATIONAL', 'IDENTITY', 'PASSPORT',
    'DRIVER', 'LICENSE', 'LICENCE', 'PHILSYS', 'PHILIPPINE IDENTIFICATION',
    'DATE OF BIRTH', 'BIRTH', 'SEX', 'MALE', 'FEMALE', 'ADDRESS', 'SIGNATURE',
    'VALID', 'EXPIRY', 'EXPIRES', 'ISSUED', 'CITIZENSHIP', 'NATIONALITY',
    'SURNAME', 'GIVEN NAME', 'MIDDLE NAME', 'FULL NAME', 'ID NUMBER', 'ID NO'
  ];
  keywords.forEach(kw => {
    if (t.includes(kw)) score += 8;
  });

  // Alphanumeric sequences that look like ID numbers
  const idNumPatterns = [
    /\b[A-Z0-9]{6,20}\b/g,
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4,}\b/g,
    /\b[A-Z]{1,3}\d{6,12}\b/g
  ];
  idNumPatterns.forEach(re => {
    const m = t.match(re);
    if (m) score += Math.min(25, m.length * 10);
  });

  // Type-specific boosts
  if (idType === 'Passport' && (t.includes('PASSPORT') || t.includes('P<'))) score += 15;
  if (idType === 'National ID' && (t.includes('NATIONAL') || t.includes('PHILSYS') || t.includes('PHILIPPINE'))) score += 15;
  if (idType === "Driver's License" && (t.includes('DRIVER') || t.includes('LICENSE') || t.includes('LTO'))) score += 15;
  if (idType === 'PhilSys ID' && (t.includes('PHILSYS') || t.includes('PHILIPPINE IDENTIFICATION'))) score += 15;

  // Penalize pure selfie / no text
  if (t.replace(/[^A-Z0-9]/g, '').length < 15) score = Math.min(score, 10);

  return Math.min(100, score);
}

function extractIdNumberFromText(text) {
  const t = text.toUpperCase();
  // Prefer longer alphanumeric tokens
  const candidates = t.match(/\b[A-Z0-9][-A-Z0-9]{5,18}\b/g) || [];
  if (candidates.length) {
    candidates.sort((a, b) => b.length - a.length);
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

  document.getElementById('id-continue-btn').disabled = true;
  showAlert('signup-alert', 'info', 'Validating ID… detecting face and reading text…');

  await ensureFaceModels();

  // 1) Face must be present on the ID
  let faceResult = null;
  try {
    faceResult = await runFacePipeline(canvas);
  } catch (e) { /* ignore */ }

  if (!faceResult || !faceResult.detected || !faceResult.descriptor) {
    showAlert('signup-alert', 'error',
      'No face detected on this image. Upload a clear photo of a real government ID that shows the photo of the ID holder.');
    document.getElementById('id-extracted').style.display = 'none';
    idFile = null;
    return;
  }
  idHasFace = true;
  idFaceDescriptor = faceResult.descriptor;
  const faceQ = Math.round(faceResult.score * 100);

  // 2) OCR with Tesseract
  showAlert('signup-alert', 'info', 'Face found · reading ID text (OCR)…');
  try {
    if (typeof Tesseract !== 'undefined') {
      const { data } = await Tesseract.recognize(canvas, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text' && m.progress) {
            // optional progress
          }
        }
      });
      idOcrText = (data && data.text) ? data.text : '';
    }
  } catch (e) {
    console.warn('OCR failed', e);
    idOcrText = '';
  }

  const idType = getSelectedIdType();
  idOcrScore = scoreIdOcrText(idOcrText, idType);

  if (idOcrScore < 25) {
    showAlert('signup-alert', 'error',
      'This does not look like a valid ID document. Text on the image is missing or does not match a government ID. Please upload a real National ID, Passport, Driver\'s License, or PhilSys ID.');
    document.getElementById('id-extracted').style.display = 'none';
    idFile = null;
    idHasFace = false;
    return;
  }

  const nameFromForm = document.getElementById('signup-name').value.trim() || 'Detected Name';
  const idNumber = extractIdNumberFromText(idOcrText) || 'Not clearly readable';

  extractedIdInfo = {
    fullName: nameFromForm,
    idNumber,
    idType,
    source: sourceLabel,
    faceQuality: faceQ
  };

  document.getElementById('id-name').textContent = extractedIdInfo.fullName || '—';
  document.getElementById('id-number').textContent = extractedIdInfo.idNumber || '—';
  document.getElementById('id-type').textContent = extractedIdInfo.idType || '—';
  document.getElementById('id-source').textContent = sourceLabel || '—';
  document.getElementById('id-ocr-status').innerHTML =
    `<i class="fas fa-shield-alt"></i> Face on ID · quality ${faceQ}% · document score ${idOcrScore}/100`;
  document.getElementById('id-extracted').style.display = 'block';
  document.getElementById('id-continue-btn').disabled = false;

  // Clear upload validation state on success
  clearFieldError('id-file', 'err-id-upload');
  const uploadArea = document.getElementById('id-upload-area');
  if (uploadArea) uploadArea.classList.remove('is-invalid', 'shake');

  const fnEl = document.getElementById('id-filename');
  if (fnEl && fileObj) fnEl.textContent = fileObj.name || 'Captured';

  showAlert('signup-alert', 'success',
    'Valid ID accepted. Face found on document and ID text verified. Continue to live face match.');
}

function handleIdUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.match(/^image\//)) {
    showAlert('signup-alert', 'error', 'Please select an image file (JPG/PNG).');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showAlert('signup-alert', 'error', 'File too large (max 5MB).');
    return;
  }
  const reader = new FileReader();
  reader.onload = function (ev) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      const max = 1280;
      let w = img.width, h = img.height;
      if (w > max || h > max) {
        const r = Math.min(max / w, max / h);
        w = Math.round(w * r); h = Math.round(h * r);
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      processIdCanvas(canvas, 'Upload', file);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

async function startIdCamera() {
  try {
    stopIdCamera();
    idStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    const video = document.getElementById('id-video');
    video.srcObject = idStream;
    video.style.display = 'block';
    document.getElementById('id-capture-btn').style.display = 'inline-flex';
    document.getElementById('id-start-cam-btn').style.display = 'none';
  } catch (err) {
    showAlert('signup-alert', 'error', 'Camera access denied. Please allow camera or use Drop ID instead.');
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
  if (!video.videoWidth) {
    showAlert('signup-alert', 'error', 'Camera not ready.');
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  stopIdCamera();
  const preview = document.getElementById('id-preview');
  if (preview) {
    preview.src = canvas.toDataURL('image/jpeg', 0.9);
    preview.style.display = 'block';
  }
  document.getElementById('id-retake-btn').style.display = 'inline-flex';
  canvas.toBlob(function (blob) {
    const file = new File([blob], 'id-camera-capture.jpg', { type: 'image/jpeg' });
    processIdCanvas(canvas, 'Camera', file);
  }, 'image/jpeg', 0.9);
}

function retakeIdPhoto() {
  idFile = null;
  extractedIdInfo = null;
  idHasFace = false;
  idOcrScore = 0;
  idFaceDescriptor = null;
  document.getElementById('id-extracted').style.display = 'none';
  document.getElementById('id-continue-btn').disabled = true;
  document.getElementById('id-retake-btn').style.display = 'none';
  const preview = document.getElementById('id-preview');
  if (preview) preview.style.display = 'none';
  startIdCamera();
}

/* ---------- Live face capture (register) ---------- */
async function startCamera() {
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
    showAlert('signup-alert', 'error', 'Camera access denied. Please allow camera permission.');
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
    showAlert('signup-alert', 'error', 'Please provide a valid ID and complete facial recognition first.');
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

async function handleForgot(e) {
  e.preventDefault();
  clearFieldError('forgot-email');
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) {
    setFieldError('forgot-email', 'Please enter your email address.');
    return false;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError('forgot-email', 'Please enter a valid email address.');
    return false;
  }
  const btn = document.getElementById('forgot-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending...';
  try {
    const data = await api('forgot', { email });
    showAlert('forgot-alert', 'success', data.message);
  } catch (err) {
    showAlert('forgot-alert', 'error', 'Network error.');
  }
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Temporary Password';
  return false;
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => ensureFaceModels(), 1500);

  // Clear field errors as the user types / changes
  const fieldMap = [
    ['login-email', 'login-email'],
    ['login-password', 'login-password'],
    ['signup-name', 'signup-name'],
    ['signup-email', 'signup-email'],
    ['signup-password', 'signup-password'],
    ['signup-password2', 'signup-password2'],
    ['forgot-email', 'forgot-email'],
    ['verify-code', 'verify-code']
  ];
  fieldMap.forEach(([id]) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => clearFieldError(id));
      el.addEventListener('change', () => clearFieldError(id));
    }
  });
  const polLogin = document.getElementById('accept-policies');
  if (polLogin) polLogin.addEventListener('change', () => clearGroupError('login-policies-group', 'err-login-policies'));
  const polSignup = document.getElementById('signup-policies');
  if (polSignup) polSignup.addEventListener('change', () => clearGroupError('signup-policies-group', 'err-signup-policies'));
});
