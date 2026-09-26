export function escapeDeliveryHTML(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function deliveryFieldHTML(key, field, radioName = "") {
  const safeKey = escapeDeliveryHTML(key);
  const label = escapeDeliveryHTML(field.label || key);
  const required = field.required ? " *" : "";
  const numeric = field.numbersOnly ? ' inputmode="numeric" pattern="[0-9]*" data-numbers-only' : "";

  if (field.type === "radio") {
    return `<label><input type="radio" name="${escapeDeliveryHTML(radioName)}" data-key="${safeKey}" value="${safeKey}"> ${label}${required}</label>`;
  }
  if (field.type === "textarea") {
    return `<div class="delivery-fields"><label>${label}${required}</label><textarea data-key="${safeKey}"${numeric}></textarea></div>`;
  }
  if (field.type === "dropdown") {
    const options = (field.options || []).map(value => {
      const safeValue = escapeDeliveryHTML(value);
      return `<option value="${safeValue}">${safeValue}</option>`;
    }).join("");
    return `<div class="delivery-fields"><label>${label}${required}</label><select data-key="${safeKey}"><option value="">-- Select --</option>${options}</select></div>`;
  }
  return `<div class="delivery-fields"><label>${label}${required}</label><input type="text" data-key="${safeKey}"${numeric}></div>`;
}

