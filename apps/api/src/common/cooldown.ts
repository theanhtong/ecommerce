const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Usernames and shop names may change at most once per 30 days.
export const withinChangeCooldown = (lastChange: Date | null, now: Date) =>
  lastChange !== null && now.getTime() - lastChange.getTime() < THIRTY_DAYS_MS;
