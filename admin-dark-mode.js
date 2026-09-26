(() => {
  "use strict";
  const key = "nsca-admin-theme";
  const root = document.documentElement;
  let theme = "light";
  try { if (localStorage.getItem(key) === "dark") theme = "dark"; } catch {}
  function apply(value) {
    theme = value;
    root.dataset.adminTheme = theme;
    const button = document.getElementById("adminThemeToggle");
    if (button) {
      button.textContent = theme === "dark" ? "Light mode" : "Dark mode";
      button.setAttribute("aria-pressed", String(theme === "dark"));
      button.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    }
  }
  apply(theme);
  document.addEventListener("DOMContentLoaded", () => {
    if (!document.getElementById("adminThemeToggle")) {
      const button = document.createElement("button");
      button.id = "adminThemeToggle";
      button.type = "button";
      const header = document.querySelector(".app-header-actions, .header, header, .admin-header");
      if (header) header.appendChild(button);
      else {
        const toolbar = document.createElement("div");
        toolbar.className = "admin-theme-toolbar";
        toolbar.appendChild(button);
        document.body.prepend(toolbar);
      }
    }
    apply(theme);
    document.getElementById("adminThemeToggle")?.addEventListener("click", () => {
      apply(theme === "dark" ? "light" : "dark");
      try { localStorage.setItem(key, theme); } catch {}
    });
  });
  window.addEventListener("storage", event => {
    if (event.key === key || event.key === null) apply(event.newValue === "dark" ? "dark" : "light");
  });
})();
