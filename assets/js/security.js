/**
 * PIPOCAFLIX - security.js v6
 * Paranoia Total Mode
 */

(function () {

'use strict';

/* ===============================
   🧠 STRING FRAGMENTATION
================================= */

const _d0 = ["www","pipocaflix","fun"];
const allowedDomain = _d0.join(".");
const redirectUrl = ["https://","www.","google",".com"].join("");

let securityTriggered = false;

/* ===============================
   🔐 HARD LOCK
================================= */

function triggerSecurity(reason) {
  if (securityTriggered) return;
  securityTriggered = true;

  try { sessionStorage.setItem("pf_flag", "1"); } catch(e){}

  window.location.replace(redirectUrl);
}

/* ===============================
   🌍 DOMAIN CHECK
================================= */

if (location.hostname !== allowedDomain) {
  triggerSecurity("domain");
}

/* ===============================
   🚫 IFRAME
================================= */

if (window.top !== window.self) {
  triggerSecurity("iframe");
}

/* ===============================
   🤖 HEADLESS / BOT
================================= */

if (
  navigator.webdriver ||
  /Headless|Phantom|Selenium|Puppeteer/i.test(navigator.userAgent)
) {
  triggerSecurity("bot");
}

/* ===============================
   🔍 DEVTOOLS DETECTION
================================= */

function detectDevTools() {

  const threshold = 160;

  if (
    window.outerWidth - window.innerWidth > threshold ||
    window.outerHeight - window.innerHeight > threshold
  ) {
    triggerSecurity("devtools-size");
  }

  const start = performance.now();
  debugger;
  const end = performance.now();

  if (end - start > 100) {
    triggerSecurity("debugger");
  }
}

setInterval(detectDevTools, 1000);

/* ===============================
   🔄 SESSION TOKEN
================================= */

if (!sessionStorage.getItem("pf_token")) {
  sessionStorage.setItem("pf_token", crypto.randomUUID());
}

/* ===============================
   🧨 SELF INTEGRITY
================================= */

const originalToString = Function.prototype.toString;

setInterval(() => {
  if (Function.prototype.toString !== originalToString) {
    triggerSecurity("function-tamper");
  }
}, 2000);

/* ===============================
   🧨 ANTI REMOVE SCRIPT
================================= */

const observer = new MutationObserver(() => {
  const scripts = document.getElementsByTagName("script");
  let found = false;

  for (let s of scripts) {
    if (s.src && s.src.includes("security")) {
      found = true;
      break;
    }
  }

  if (!found) {
    triggerSecurity("script-removed");
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

/* ===============================
   🔒 BLOQUEIOS ABSOLUTOS
================================= */

// Botão direito
document.addEventListener('contextmenu', e => e.preventDefault());

// Selecionar texto
document.addEventListener('selectstart', e => e.preventDefault());
document.addEventListener('mousedown', e => {
  if (e.detail > 1) e.preventDefault();
});

// Drag
document.addEventListener('dragstart', e => e.preventDefault());

// Copy / Cut / Paste
document.addEventListener('copy', e => e.preventDefault());
document.addEventListener('cut', e => e.preventDefault());
document.addEventListener('paste', e => e.preventDefault());

// Clipboard API override
navigator.clipboard && (navigator.clipboard.writeText = () => Promise.reject());

/* ===============================
   ⌨️ BLOQUEIO TOTAL DE TECLADO
================================= */

document.addEventListener('keydown', function (e) {

  const key = e.key.toLowerCase();

  // F12
  if (key === 'f12') return e.preventDefault();

  // F5 / Ctrl+R
  if (key === 'f5') return e.preventDefault();

  if (e.ctrlKey) {

    const blocked = [
      'u','s','p','c','v','a','r','i','j','k','h','o'
    ];

    if (blocked.includes(key)) {
      e.preventDefault();
      return false;
    }

    if (e.shiftKey) {
      const shiftBlocked = ['i','j','c','k'];
      if (shiftBlocked.includes(key)) {
        e.preventDefault();
        return false;
      }
    }
  }

});

/* ===============================
   🖨️ BLOQUEAR IMPRESSÃO
================================= */

window.addEventListener('beforeprint', e => {
  e.preventDefault();
  triggerSecurity("print");
});

/* ===============================
   🔥 CONSOLE PSYCHOLOGICAL
================================= */

setTimeout(() => {
  console.log("%cPARE.", "color:red;font-size:40px;font-weight:bold;");
}, 800);

})();
