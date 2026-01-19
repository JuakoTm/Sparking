// js/pages/login.js
// Combina el script no-modular (toggle + navegación entre formularios)
// y el script modular que interactúa con `js/auth/auth.js`.
import { loginUser, registerUser, resetPasswordUser, monitorAuthState } from '../auth/auth.js';

// Delegación de eventos para los botones de toggle password
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.toggle-password');
  if (!btn) return;

  const targetId = btn.dataset.target;
  const input = document.getElementById(targetId);
  const icon = btn.querySelector('i');

  if (!input || !icon) return;

  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
    btn.classList.add('text-blue-600');
  } else {
    input.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
    btn.classList.remove('text-blue-600');
  }
});

// Funciones de Navegación entre formularios
function hideAll() {
  document.getElementById('login-form')?.classList.add('hidden');
  document.getElementById('register-form')?.classList.add('hidden');
  document.getElementById('recover-form')?.classList.add('hidden');
  const msg = document.getElementById('auth-message');
  if (msg) msg.className = 'hidden';
}

function showLogin() {
  hideAll();
  document.getElementById('login-form')?.classList.remove('hidden');
}

function showRegister() {
  hideAll();
  document.getElementById('register-form')?.classList.remove('hidden');
}

function showRecovery() {
  hideAll();
  document.getElementById('recover-form')?.classList.remove('hidden');
  // Pre-llenar email si viene del login
  const loginEmail = document.getElementById('login-email')?.value;
  if (loginEmail) {
    const recover = document.getElementById('recover-email');
    if (recover) recover.value = loginEmail;
  }
}

// Event Listeners para navegación
document.getElementById('link-show-register')?.addEventListener('click', (e) => {
  e.preventDefault();
  showRegister();
});

document.getElementById('link-show-recovery')?.addEventListener('click', (e) => {
  e.preventDefault();
  showRecovery();
});

document.getElementById('link-back-login-1')?.addEventListener('click', (e) => {
  e.preventDefault();
  showLogin();
});

document.getElementById('link-back-login-2')?.addEventListener('click', (e) => {
  e.preventDefault();
  showLogin();
});

// Manejo de mensajes
const msgElement = document.getElementById('auth-message');
function showMessage(text, type = 'success') {
  if (!msgElement) return;

  const bgColors = {
    success: 'bg-emerald-100 text-emerald-600',
    error: 'bg-rose-100 text-rose-600',
    info: 'bg-blue-100 text-blue-600'
  };

  msgElement.innerText = text;
  msgElement.className = `mb-4 p-3 rounded-xl text-sm font-bold text-center ${bgColors[type] || bgColors.info}`;
}

// --- 1. LOGIN ---
document.getElementById('btn-login')?.addEventListener('click', async () => {
  const email = document.getElementById('login-email')?.value.trim();
  const pass = document.getElementById('login-pass')?.value;
  const btn = document.getElementById('btn-login');

  if (!email || !pass) {
    showMessage('Por favor completa todos los campos', 'error');
    return;
  }

  const originalText = btn?.innerHTML;
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entrando...';
    btn.disabled = true;
  }

  const result = await loginUser(email, pass);

  if (!result.success) {
    showMessage(result.message, 'error');
    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  } else {
    window.location.href = 'dashboard.html';
  }
});

// --- 2. REGISTRO ---
document.getElementById('btn-register')?.addEventListener('click', async () => {
  const email = document.getElementById('reg-email')?.value.trim();
  const pass = document.getElementById('reg-pass')?.value;
  const confirm = document.getElementById('reg-confirm-pass')?.value;
  const btn = document.getElementById('btn-register');

  if (pass !== confirm) {
    showMessage('Las contraseñas no coinciden', 'error');
    return;
  }

  if (pass.length < 6) {
    showMessage('La contraseña debe tener al menos 6 caracteres', 'error');
    return;
  }

  const originalText = btn?.innerHTML;
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creando...';
    btn.disabled = true;
  }

  const result = await registerUser(email, pass);

  if (result.success) {
    showMessage('Cuenta creada. Verifica tu correo.', 'success');
    setTimeout(() => {
      showLogin();
      const loginEmailInput = document.getElementById('login-email');
      if (loginEmailInput) loginEmailInput.value = email;
    }, 2000);
  } else {
    showMessage(result.message, 'error');
    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
});

// --- 3. RECUPERAR CONTRASEÑA ---
document.getElementById('btn-recover')?.addEventListener('click', async () => {
  const email = document.getElementById('recover-email')?.value.trim();
  const btn = document.getElementById('btn-recover');

  if (!email) {
    showMessage('Ingresa tu correo electrónico', 'error');
    return;
  }

  const originalText = btn?.innerHTML;
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';
    btn.disabled = true;
  }

  const result = await resetPasswordUser(email);

  if (result.success) {
    showMessage(result.message, 'success');
    setTimeout(() => {
      showLogin();
    }, 4000);
  } else {
    showMessage(result.message, 'error');
  }

  if (btn) {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
});

// Permitir Enter en los formularios
document.getElementById('login-pass')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-login')?.click();
});

document.getElementById('reg-confirm-pass')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-register')?.click();
});

document.getElementById('recover-email')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-recover')?.click();
});

// Optional: start auth monitor if available
if (typeof monitorAuthState === 'function') {
  try { monitorAuthState(); } catch (e) { /* ignore */ }
}

// Click en logo/nombre vuelve a la portada (misma pestaña)
try {
  const brand = document.getElementById('site-brand');
  if (brand) brand.addEventListener('click', () => { window.location.href = 'index.html'; });
} catch (err) { /* ignore */ }
