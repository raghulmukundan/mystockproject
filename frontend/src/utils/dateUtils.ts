/**
 * Utility functions for date/time formatting with timezone awareness
 */

/**
 * Formats a timestamp to America/Chicago timezone with full date and time
 */
export const formatChicagoDateTime = (iso?: string | null): string => {
  if (!iso) return 'N/A';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Chicago',
      timeZoneName: 'short'
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
};

/**
 * Formats a timestamp to America/Chicago timezone without timezone name
 */
export const formatChicago = (iso?: string | null): string => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Chicago'
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
};

/**
 * Formats a timestamp for compact display (shorter format)
 */
export const formatChicagoCompact = (iso?: string | null): string => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Chicago'
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
};