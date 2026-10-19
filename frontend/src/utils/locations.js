/**
 * The areas Mant Bridges advertises, in one place so the home search, the property filters and the
 * page copy cannot drift into three different versions of the same sentence.
 *
 * The backend filters `city` with `icontains`, so these values only have to appear inside the
 * administrator's spelling of a city, not match it exactly.
 */
export const CORE_CITIES = ['Kampala', 'Wakiso', 'Mukono', 'Masaka']

export const OTHER_MAJOR_CITIES = [
  'Entebbe',
  'Jinja',
  'Njeru',
  'Iganga',
  'Mbarara',
  'Bushenyi',
  'Hoima',
  'Fort Portal',
  'Kasese',
  'Masindi',
  'Mubende',
  'Mbale',
  'Soroti',
  'Gulu',
  'Lira',
  'Arua',
]

/**
 * Options for a location select: the four areas we name first, then the other major cities, then any
 * city an administrator has listed property in that is not already covered — so a listing in an
 * unexpected place is still findable instead of being invisible to the filter.
 */
export function locationGroups(listed = []) {
  const named = new Set([...CORE_CITIES, ...OTHER_MAJOR_CITIES].map((city) => city.toLowerCase()))
  const extra = listed
    .map((row) => (typeof row === 'string' ? row : row.city))
    .filter((city) => city && !named.has(city.toLowerCase()))
    .sort((a, b) => a.localeCompare(b))

  const groups = [
    { label: 'Where we work', cities: CORE_CITIES },
    { label: 'Other major cities of Uganda', cities: OTHER_MAJOR_CITIES },
  ]
  if (extra.length) groups.push({ label: 'Other listed areas', cities: extra })
  return groups
}
