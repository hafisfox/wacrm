export function formatPaise(value: number | string | null | undefined) {
  const paise = Number(value || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set';
  const parsed = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(parsed);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(parsed);
}

export function formatTime(value: string | null | undefined) {
  if (!value) return 'Not set';
  return String(value).slice(0, 5);
}

export function compactPhone(value: string | null | undefined) {
  const phone = String(value || '').trim();
  if (!phone) return 'Unknown';
  return phone.startsWith('+') ? phone : `+${phone}`;
}
