const page = location.pathname.split("/").pop() || "index.html";
const nav = document.querySelector(".tabs");
const groups = [
  ["Workspace", [
    ["dashboard.html", "Dashboard"],
    ["index.html", "Payroll"],
    ["index.html#employees", "Employees"],
    ["attendance.html", "Attendance & Leave"]
  ]],
  ["Payroll tools", [
    ["index.html#special-pay", "Special pay"],
    ["index.html#history", "History"],
    ["payslips.html", "Payslips"],
    ["reports.html", "Reports"]
  ]],
  ["Administration", [
    ["audit.html", "Audit log"],
    ["settings.html", "Settings"]
  ]]
];

if (nav) {
  document.body.classList.add("payroll-shell");
  nav.id = "payrollNavigation";
  nav.setAttribute("aria-label", "Payroll navigation");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "nav-toggle";
  toggle.textContent = "Menu";
  toggle.setAttribute("aria-controls", nav.id);
  toggle.setAttribute("aria-expanded", "false");
  document.querySelector(".topbar").append(toggle);
  const setExpanded = expanded => {
    nav.classList.toggle("nav-open", expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
  };
  toggle.addEventListener("click", () => setExpanded(!nav.classList.contains("nav-open")));
  nav.addEventListener("click", event => {
    if (event.target.closest("a")) setExpanded(false);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && nav.classList.contains("nav-open")) {
      setExpanded(false);
      toggle.focus();
    }
  });
}

function renderNav() {
  if (!nav) return;
  nav.replaceChildren();
  for (const [title, items] of groups) {
    const group = document.createElement("div");
    group.className = "nav-group";
    const heading = document.createElement("p");
    heading.textContent = title;
    group.append(heading);
    for (const [href, label] of items) {
      const [target, hash = ""] = href.split("#");
      const link = document.createElement("a");
      link.href = "./" + href;
      link.textContent = label;
      const active = page === target && (target !== "index.html" || location.hash.slice(1) === hash ||
        (href === "index.html" && location.hash === "#driver-reconciliation") ||
        (hash === "employees" && location.hash.startsWith("#employee/")));
      if (active) {
        link.className = "active";
        link.setAttribute("aria-current", "page");
      }
      group.append(link);
    }
    nav.append(group);
  }
}

renderNav();
window.addEventListener("hashchange", renderNav);
