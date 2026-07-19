/**
 * Salon control stores amounts as integer paise, while operators should never
 * have to calculate minor units in a form. These helpers keep that conversion
 * explicit at the client boundary without changing the existing API contract.
 */
export function paiseToRupeesInput(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return '';
  const paise = Number(value);
  if (!Number.isFinite(paise)) return '';
  return String(paise / 100);
}

export function rupeesToPaiseInput(
  value: FormDataEntryValue | null | undefined
) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const normalized = raw.replace(/[₹,\s]/g, '');
  const rupees = Number(normalized);
  if (!Number.isFinite(rupees) || rupees < 0) return raw;
  return String(Math.round(rupees * 100));
}
