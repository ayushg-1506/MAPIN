/* ─── MAPIN Auth Module ─── */

const AUTH_TOKEN_KEY = "mapin_auth_token";
const AUTH_USER_KEY = "mapin_auth_user";

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_KEY));
  } catch {
    return null;
  }
}

function setAuth(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authApi(path, options = {}) {
  const headers = options.body instanceof FormData
    ? { ...authHeaders() }
    : { "Content-Type": "application/json", ...authHeaders() };
  const response = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function checkSession() {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const result = await authApi("/api/auth/me");
    return result.user;
  } catch {
    clearAuth();
    return null;
  }
}

async function login(email, password) {
  const result = await authApi("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  setAuth(result.token, result.user);
  return result.user;
}

async function signup(email, password, name, institution) {
  const result = await authApi("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, name, institution })
  });
  setAuth(result.token, result.user);
  return result.user;
}

async function logout() {
  try {
    await authApi("/api/auth/logout", { method: "POST" });
  } catch { /* ignore */ }
  clearAuth();
}

/* ─── Auth Modal UI ─── */

function createAuthModal() {
  const overlay = document.createElement("div");
  overlay.id = "authOverlay";
  overlay.innerHTML = `
    <div class="auth-backdrop"></div>
    <div class="auth-modal">
      <div class="auth-header">
        <svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" style="height: 60px; width: auto;">
          <polygon points="20,30 60,30 100,90 140,30 180,30 180,140 140,140 140,90 100,150 60,90 60,140 20,140" fill="#1f2937" />
          <path d="M100,15 C75,15 55,35 55,60 C55,90 100,130 100,130 L100,75 A15,15 0 0,1 100,45 L100,15 Z" fill="#11c1e0"/>
          <path d="M100,15 C125,15 145,35 145,60 C145,90 100,130 100,130 L100,75 A15,15 0 0,0 100,45 L100,15 Z" fill="#0ea3be"/>
          <text x="104" y="185" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="34" text-anchor="middle" fill="#111827" letter-spacing="4">MAPIN</text>
        </svg>
        <h2 id="authTitle">Admin Login</h2>
        <p class="auth-subtitle">Access your campus dashboard</p>
      </div>

      <div id="authError" class="auth-error" style="display:none;"></div>

      <form id="loginForm" class="auth-form">
        <label>
          <span>Email</span>
          <input id="loginEmail" type="email" placeholder="admin@college.edu" required>
        </label>
        <label>
          <span>Password</span>
          <input id="loginPassword" type="password" placeholder="••••••••" required>
        </label>
        <button class="button primary wide" type="submit">Login</button>
        <p class="auth-switch">Don't have an account? <a href="#" id="showSignup">Create one</a></p>
      </form>

      <form id="signupForm" class="auth-form" style="display:none;">
        <label>
          <span>Full Name</span>
          <input id="signupName" type="text" placeholder="Your name" required>
        </label>
        <label>
          <span>College / Institution</span>
          <input id="signupInstitution" type="text" placeholder="e.g. BMS College of Engineering">
        </label>
        <label>
          <span>Email</span>
          <input id="signupEmail" type="email" placeholder="admin@college.edu" required>
        </label>
        <label>
          <span>Password</span>
          <input id="signupPassword" type="password" placeholder="Min 4 characters" required minlength="4">
        </label>
        <button class="button primary wide" type="submit">Create Account</button>
        <p class="auth-switch">Already have an account? <a href="#" id="showLogin">Login</a></p>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  /* Switch forms */
  document.getElementById("showSignup").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("loginForm").style.display = "none";
    document.getElementById("signupForm").style.display = "grid";
    document.getElementById("authTitle").textContent = "Create Account";
    document.getElementById("authError").style.display = "none";
  });

  document.getElementById("showLogin").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("signupForm").style.display = "none";
    document.getElementById("loginForm").style.display = "grid";
    document.getElementById("authTitle").textContent = "Admin Login";
    document.getElementById("authError").style.display = "none";
  });

  /* Login submit */
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector("button[type=submit]");
    btn.disabled = true;
    document.getElementById("authError").style.display = "none";
    try {
      await login(
        document.getElementById("loginEmail").value,
        document.getElementById("loginPassword").value
      );
      hideAuthModal();
      if (typeof onAuthSuccess === "function") onAuthSuccess();
    } catch (err) {
      document.getElementById("authError").textContent = err.message;
      document.getElementById("authError").style.display = "block";
    } finally {
      btn.disabled = false;
    }
  });

  /* Signup submit */
  document.getElementById("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector("button[type=submit]");
    btn.disabled = true;
    document.getElementById("authError").style.display = "none";
    try {
      await signup(
        document.getElementById("signupEmail").value,
        document.getElementById("signupPassword").value,
        document.getElementById("signupName").value,
        document.getElementById("signupInstitution").value
      );
      hideAuthModal();
      if (typeof onAuthSuccess === "function") onAuthSuccess();
    } catch (err) {
      document.getElementById("authError").textContent = err.message;
      document.getElementById("authError").style.display = "block";
    } finally {
      btn.disabled = false;
    }
  });

  return overlay;
}

function showAuthModal() {
  let overlay = document.getElementById("authOverlay");
  if (!overlay) overlay = createAuthModal();
  overlay.style.display = "flex";
}

function hideAuthModal() {
  const overlay = document.getElementById("authOverlay");
  if (overlay) overlay.style.display = "none";
}
