// Keep existing controls and listeners; only move them into the seasonal banner.
(() => {
  const version = document.getElementById('appVersion');
  const settings = document.getElementById('settingsBtn');
  if (!version || !settings || document.querySelector('.driver-holiday-header')) return;
  const previousHeader = version.closest('.apk-header');
  const header = document.createElement('header');
  header.className = 'driver-holiday-header';
  header.setAttribute('aria-label', 'NSCA Driver');
  const copy = document.createElement('div');
  copy.className = 'driver-holiday-copy';
  const greeting = document.createElement('div');
  greeting.className = 'driver-holiday-greeting';
  greeting.textContent = 'Safe deliveries this holiday season';
  (previousHeader || version).before(header);
  copy.append(version, greeting);
  settings.setAttribute('aria-label', 'Open settings');
  settings.setAttribute('title', 'Settings');
  // Remove the web button's old fixed-position inline styling.
  settings.removeAttribute('style');
  header.append(copy, settings);
  if (previousHeader) previousHeader.remove();
})();
