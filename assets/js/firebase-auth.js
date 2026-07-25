/* ============================================================
   TUDOPDF — firebase-auth.js
   Login com Google via Firebase Auth
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-analytics.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAjp2CToaMXrQ4AdkniCcoVJUcLeeOBZoc",
  authDomain: "tudo-pdf.firebaseapp.com",
  projectId: "tudo-pdf",
  storageBucket: "tudo-pdf.firebasestorage.app",
  messagingSenderId: "357331585036",
  appId: "1:357331585036:web:00db33990df7e84e3fc629",
  measurementId: "G-QZ9XKJVZQK"
};

const app      = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth     = getAuth(app);
const provider = new GoogleAuthProvider();

/* ── Expor funções globais ── */
window.loginWithGoogle = async function () {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error("Login error:", e);
    if (window.showToast) showToast("❌ Erro ao fazer login. Tente novamente.");
  }
};

window.logoutGoogle = async function () {
  await signOut(auth);
  if (window.showToast) showToast("👋 Você saiu da sua conta.");
};

/* ── Atualiza a UI conforme estado do login ── */
onAuthStateChanged(auth, (user) => {
  // Notifica ferramentas que dependem de auth state
  if (typeof window._onAuthChange === 'function') window._onAuthChange(user);
  const btnHeader  = document.getElementById("btn-login-header");
  const userMenu   = document.getElementById("user-menu");
  const userAvatar = document.getElementById("user-avatar");
  const userName   = document.getElementById("user-name");
  const userEmail  = document.getElementById("user-email");

  if (user) {
    // Usuário logado
    if (btnHeader) btnHeader.style.display = "none";
    if (userMenu)  userMenu.style.display  = "flex";
    if (userAvatar && user.photoURL) userAvatar.src = user.photoURL;
    if (userName)  userName.textContent  = user.displayName || "Usuário";
    if (userEmail) userEmail.textContent = user.email || "";
  } else {
    // Não logado
    if (btnHeader) { btnHeader.style.display = ""; btnHeader.textContent = "Entrar com Google"; }
    if (userMenu)  userMenu.style.display  = "none";
  }
});
