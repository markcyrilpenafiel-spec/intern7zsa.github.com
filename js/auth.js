/**
 * Firebase Auth helpers + UI nav state for Rene Coffee
 * - Signup sends email verification
 * - Login can warn if email not verified
 * - Forgot password via Firebase
 */
(function () {
  const AUTH_REDIRECT_KEY = 'coffeeBlendAuthRedirect';

  function loadFirebase() {
    return new Promise((resolve, reject) => {
      if (window.firebase && window.firebase.apps && window.firebase.apps.length) {
        resolve(window.firebase);
        return;
      }
      if (!window.FIREBASE_CONFIG || !window.FIREBASE_ENABLED) {
        reject(new Error('Firebase not configured. Edit js/firebase-config.js'));
        return;
      }
      const s1 = document.createElement('script');
      s1.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js';
      s1.onload = () => {
        const s2 = document.createElement('script');
        s2.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js';
        s2.onload = () => {
          try {
            firebase.initializeApp(window.FIREBASE_CONFIG);
            resolve(firebase);
          } catch (e) {
            reject(e);
          }
        };
        s2.onerror = () => reject(new Error('Failed to load firebase-auth'));
        document.head.appendChild(s2);
      };
      s1.onerror = () => reject(new Error('Failed to load firebase-app'));
      document.head.appendChild(s1);
    });
  }

  window.CoffeeAuth = {
    user: null,
    ready: false,

    async init() {
      try {
        await loadFirebase();
        return new Promise((resolve) => {
          firebase.auth().onAuthStateChanged((user) => {
            this.user = user;
            this.ready = true;
            this.updateNav();
            resolve(user);
          });
        });
      } catch (e) {
        console.warn('[CoffeeAuth]', e.message);
        this.ready = true;
        this.updateNav();
        return null;
      }
    },

    requireAuth(redirectTo) {
      if (this.user) return true;
      sessionStorage.setItem(AUTH_REDIRECT_KEY, redirectTo || window.location.href);
      window.location.href = 'login.html';
      return false;
    },

    /**
     * Require logged-in + verified email.
     * Redirects to login or verify-email.html as needed.
     * Returns true only when user is present and emailVerified.
     */
    requireVerified(redirectTo) {
      const dest = redirectTo || window.location.href;
      if (!this.user) {
        sessionStorage.setItem(AUTH_REDIRECT_KEY, dest);
        window.location.href = 'login.html';
        return false;
      }
      if (!this.user.emailVerified) {
        sessionStorage.setItem(AUTH_REDIRECT_KEY, dest);
        window.location.href = 'verify-email.html';
        return false;
      }
      return true;
    },

    async signup(email, password, displayName) {
      await loadFirebase();
      const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
      if (displayName) {
        await cred.user.updateProfile({ displayName });
      }
      // Always send verification email
      await cred.user.sendEmailVerification();
      return cred.user;
    },

    async login(email, password) {
      await loadFirebase();
      const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
      return cred.user;
    },

    /** Returns true if the current user has verified their email */
    isEmailVerified() {
      return !!(this.user && this.user.emailVerified);
    },

    /** Resend the verification email to the currently signed-in user */
    async resendVerification() {
      await loadFirebase();
      const user = firebase.auth().currentUser;
      if (!user) throw new Error('No user signed in');
      await user.sendEmailVerification();
    },

    async logout() {
      await loadFirebase();
      await firebase.auth().signOut();
      this.user = null;
      this.updateNav();
    },

    async forgotPassword(email) {
      await loadFirebase();
      await firebase.auth().sendPasswordResetEmail(email);
    },

    getRedirect() {
      const url = sessionStorage.getItem(AUTH_REDIRECT_KEY) || 'index.html';
      sessionStorage.removeItem(AUTH_REDIRECT_KEY);
      return url;
    },

    updateNav() {
      const slots = document.querySelectorAll('[data-auth-nav]');
      slots.forEach((el) => {
        if (this.user) {
          const name = this.user.displayName || this.user.email || 'Account';
          const verifiedBadge = this.user.emailVerified
            ? ''
            : ' <span class="badge badge-warning" style="font-size:10px;background:#c49b63;color:#111;">Unverified</span>';
          el.innerHTML = `
            <a class="nav-link dropdown-toggle" href="#" id="userDropdown" data-toggle="dropdown">
              <span class="icon icon-user"></span> ${this.escape(name.split('@')[0])}${verifiedBadge}
            </a>
            <div class="dropdown-menu" aria-labelledby="userDropdown">
              <span class="dropdown-item-text small text-muted">${this.escape(this.user.email || '')}</span>
              ${!this.user.emailVerified ? '<a class="dropdown-item" href="#" id="resend-verify-link">Resend verification email</a>' : ''}
              <a class="dropdown-item" href="cart.html">My Cart</a>
              <a class="dropdown-item" href="#" id="logout-link">Logout</a>
            </div>`;
          const logout = el.querySelector('#logout-link');
          if (logout) {
            logout.addEventListener('click', async (e) => {
              e.preventDefault();
              await this.logout();
              window.location.href = 'index.html';
            });
          }
          const resend = el.querySelector('#resend-verify-link');
          if (resend) {
            resend.addEventListener('click', async (e) => {
              e.preventDefault();
              try {
                await this.resendVerification();
                alert('Verification email sent. Check your inbox (and spam).');
              } catch (err) {
                alert(err.message || 'Could not resend email');
              }
            });
          }
        } else {
          el.innerHTML = `
            <a href="login.html" class="nav-link">Login</a>
          `;
        }
      });

      document.querySelectorAll('[data-auth-guest]').forEach((el) => {
        el.style.display = this.user ? 'none' : '';
      });
      document.querySelectorAll('[data-auth-user]').forEach((el) => {
        el.style.display = this.user ? '' : 'none';
      });
    },

    escape(str) {
      const d = document.createElement('div');
      d.textContent = str || '';
      return d.innerHTML;
    },

    fillCheckoutFromUser() {
      if (!this.user) return;
      const email = document.getElementById('email');
      const first = document.getElementById('firstname');
      if (email && !email.value) email.value = this.user.email || '';
      if (first && !first.value && this.user.displayName) {
        const parts = this.user.displayName.trim().split(/\s+/);
        first.value = parts[0] || '';
        const last = document.getElementById('lastname');
        if (last && parts.length > 1) last.value = parts.slice(1).join(' ');
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.CoffeeAuth.init());
  } else {
    window.CoffeeAuth.init();
  }
})();
