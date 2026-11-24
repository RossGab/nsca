export function calculateSpecialPay({
  eligibleBasic, divisor, priorSpecial, finalPay, unpaidWages, leaveCredit, otherAmounts, deductions
}) {
  const thirteenthCents = Math.max(0, Math.round(eligibleBasic * 100 / divisor) - Math.round(priorSpecial * 100));
  const finalCents = finalPay
    ? thirteenthCents + [unpaidWages, leaveCredit, otherAmounts, -deductions]
      .reduce((sum, amount) => sum + Math.round(amount * 100), 0)
    : thirteenthCents;
  return {thirteenth: thirteenthCents / 100, total: finalCents / 100};
}

if (typeof document !== "undefined") {
  const field = id => document.getElementById(id);
  const amount = id => field(id).valueAsNumber;
  const form = field("specialPayForm");
  const mode = field("specialMode");
  const result = field("specialPayResult");
  const money = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});
  form.addEventListener("input", () => { result.textContent = ""; });
  mode.addEventListener("change", () => {
    for (const group of form.querySelectorAll("[data-final-pay]")) {
      group.hidden = group.querySelector("input").disabled = mode.value !== "final";
    }
  });
  mode.dispatchEvent(new Event("change"));
  form.addEventListener("submit", event => {
    event.preventDefault();
    const finalPay = mode.value === "final";
    const {thirteenth, total} = calculateSpecialPay({
      eligibleBasic: amount("eligibleBasic"), divisor: amount("specialDivisor"),
      priorSpecial: amount("priorSpecial"), finalPay, unpaidWages: amount("unpaidWages"),
      leaveCredit: amount("leaveCredit"), otherAmounts: amount("finalAdditions"), deductions: amount("finalDeductions")
    });
    result.textContent = finalPay
      ? `Estimated final pay ${money.format(total)} (includes ${money.format(thirteenth)} remaining 13th-month pay).`
      : `Estimated 13th-month balance ${money.format(thirteenth)}.`;
  });
}
