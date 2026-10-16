const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parse(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    // A bare YYYY-MM-DD is a calendar day, not an instant: parsing it as UTC
    // moves it a day backwards for browsers west of Greenwich.
    const day = DATE_ONLY.exec(value);
    if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Money that the backend already formatted (`*_display`) always wins. */
export function money(value, fallbackCurrency = 'UGX') {
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return '—';
  return `${fallbackCurrency} ${numeric.toLocaleString('en-UG', { maximumFractionDigits: 0 })}`;
}

export function amount(record, key = 'total', currency = 'UGX') {
  const display = record?.[`${key}_display`];
  if (display) return display;
  const value = record?.[key] ?? record?.[`${key}_str`];
  if (value == null) return '—';
  return money(value, record?.currency || currency);
}

export function shortMoney(value, currency = 'UGX') {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '—';
  const units = [
    [1e9, 'bn'],
    [1e6, 'm'],
    [1e3, 'k'],
  ];
  for (const [size, suffix] of units) {
    if (Math.abs(numeric) >= size) {
      const scaled = numeric / size;
      return `${currency === 'UGX' ? '' : `${currency} `}${scaled.toFixed(scaled >= 100 ? 0 : 1)}${suffix}`;
    }
  }
  return `${numeric.toFixed(0)}`;
}

export function percent(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${numeric.toFixed(digits)}%`;
}

export function dateLabel(value) {
  const d = parse(value);
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function dateTimeLabel(value) {
  const d = parse(value);
  if (!d) return '—';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${dateLabel(d)} · ${hours}:${minutes}`;
}

export function relativeTime(value) {
  const d = parse(value);
  if (!d) return '—';
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const steps = [
    [60, 'min'],
    [24, 'hr'],
    [7, 'day'],
    [4.35, 'week'],
    [12, 'month'],
  ];
  let amount = seconds / 60;
  let unit = 'min';
  for (const [factor, name] of steps) {
    if (Math.abs(amount) < factor) break;
    amount /= factor;
    unit = name;
  }
  const rounded = Math.max(1, Math.round(amount));
  const suffix = unit === 'min' || unit === 'hr' ? ' ago' : unit === 'day' ? ' ago' : ' ago';
  return `${rounded} ${unit}${rounded > 1 ? 's' : ''}${suffix}`;
}

/** Value for a `<input type="date">` from an ISO string or plain date. */
export function dateInputValue(value) {
  const d = parse(value);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayInputValue(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return dateInputValue(d);
}

export function monthKey(value) {
  const d = parse(value);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function firstOfMonth(offsetMonths = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths, 1);
  return dateInputValue(d);
}

export function endOfMonth(offsetMonths = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths + 1, 0);
  return dateInputValue(d);
}

export function initials(record) {
  if (record?.initials) return record.initials;
  const name = record?.full_name || `${record?.first_name || ''} ${record?.last_name || ''}`;
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export function pluralize(count, singular, plural) {
  const n = Number(count) || 0;
  return `${n.toLocaleString()} ${n === 1 ? singular : plural ?? `${singular}s`}`;
}

export function titleCase(value = '') {
  return value
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}
