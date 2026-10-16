// Shared site script: store link + header/footer.
// STORE_URL is empty until the extension is published; buttons then show "Coming soon".
window.SITE = {
  STORE_URL: "",
  EMAIL: "cook.devtools@gmail.com",
  // Google Form that collects uninstall feedback (set after the form is created): { action, reason, comment }
  UNINSTALL_FORM: null,
};

(function () {
  const S = window.SITE;
  const path = location.pathname;
  const link = (href, text) => `<a href="${href}"${path === href ? ' aria-current="page"' : ""}>${text}</a>`;
  const header = `
    <header class="site-header"><div class="wrap">
      <a class="brand" href="/"><img src="/assets/logo-256.png" alt="" width="28" height="28">Eye Dropper Color Picker</a>
      <nav class="nav">${link("/", "Image color picker")}${link("/help/", "Help")}${link("/privacy/", "Privacy")}</nav>
    </div></header>`;
  const footer = `
    <footer class="site-footer"><div class="wrap">
      <span>© ${new Date().getFullYear()} Cook DevTools</span>
      <a href="/privacy/">Privacy policy</a>
      <a href="/help/">Help</a>
      <a href="/feedback/">Feedback</a>
      <a href="mailto:${S.EMAIL}">${S.EMAIL}</a>
    </div></footer>`;
  document.body.insertAdjacentHTML("afterbegin", header);
  document.body.insertAdjacentHTML("beforeend", footer);

  for (const a of document.querySelectorAll("[data-store-link]")) {
    if (S.STORE_URL) { a.href = S.STORE_URL; a.target = "_blank"; a.rel = "noopener"; }
    else { a.setAttribute("aria-disabled", "true"); a.removeAttribute("href"); a.textContent = "Coming soon to the Chrome Web Store"; }
  }
})();

window.toast = function (msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => { t.hidden = true; }, 1600);
};
window.copyText = async function (text, label) {
  try { await navigator.clipboard.writeText(text); } catch {}
  window.toast(label || `Copied ${text}`);
};
