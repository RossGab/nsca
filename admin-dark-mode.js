(() => {
  "use strict";
  const key = "nsca-admin-theme";
  const root = document.documentElement;
  let theme = "light";
  try { if (localStorage.getItem(key) === "dark") theme = "dark"; } catch {}
  function apply(value) {
    theme = value;
    root.dataset.adminTheme = theme;
    const checkbox = document.getElementById("adminThemeToggle");
    if (checkbox) checkbox.checked = theme === "dark";
  }
  apply(theme);
  document.addEventListener("DOMContentLoaded", () => {
    apply(theme);
    // Only admin.html supplies the control; other pages inherit the preference.
    document.getElementById("adminThemeToggle")?.addEventListener("change", event => {
      apply(event.target.checked ? "dark" : "light");
      try { localStorage.setItem(key, theme); } catch {}
    });
  });
  window.addEventListener("storage", event => {
    if (event.key === key || event.key === null) apply(event.newValue === "dark" ? "dark" : "light");
  });
})();
