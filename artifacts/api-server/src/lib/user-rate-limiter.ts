const windowMs = 60_000;
const requests = new Map<string, number[]>();

export function checkUserRpm(userKeyId: string, rpmLimit: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  let timestamps = requests.get(userKeyId);
  if (!timestamps) {
    timestamps = [];
    requests.set(userKeyId, timestamps);
  }
  while (timestamps.length > 0 && timestamps[0] < cutoff) timestamps.shift();
  if (timestamps.length >= rpmLimit) return false;
  timestamps.push(now);
  return true;
}

export function getUserRpmUsage(userKeyId: string): number {
  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = requests.get(userKeyId) ?? [];
  return timestamps.filter(t => t >= cutoff).length;
}
