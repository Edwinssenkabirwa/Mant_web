/**
 * Media URLs come back from Django as absolute addresses pointing at the
 * backend host. Strip the origin so the path resolves through the Vite proxy in
 * development and through the same domain in production.
 */
const PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420">
      <rect width="640" height="420" fill="#E9EEF5"/>
      <path d="M188 262l92-84 92 84" fill="none" stroke="#A9B8CB" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="240" y="196" width="60" height="26" rx="6" fill="#C6D2E1"/>
    </svg>`
  );

export function mediaUrl(value, { fallback = PLACEHOLDER } = {}) {
  if (!value) return fallback;
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;

  let path = value;
  try {
    path = new URL(value).pathname;
  } catch {
    if (!value.startsWith('/')) return fallback;
  }

  const base = import.meta.env.VITE_MEDIA_BASE_URL;
  return base ? `${base.replace(/\/$/, '')}${path}` : path;
}

export function companyLogo(company) {
  return company?.logo_url ? mediaUrl(company.logo_url, { fallback: '' }) : '';
}
