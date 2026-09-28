/* A deliberately small rate limiter.

   Every planning call spends money on the Anthropic API, so without a
   ceiling one signed-in user refreshing in a loop is an unbounded bill.

   CAVEAT, stated plainly: this counter lives in the memory of a single
   serverless instance. Netlify may run several concurrently and recycles
   them freely, so the real-world limit is looser than the number below
   and resets unpredictably. It is a guard against accidents and casual
   abuse, NOT a defence against a determined attacker. Before this
   endpoint is exposed to the public, move the counter to Netlify Blobs
   or another shared store. */

const buckets = new Map();

export function checkRate(key, { limit = 10, windowMs = 3600000, now = Date.now() } = {}) {
  const bucket = buckets.get(key)?.filter(t => now - t < windowMs) || [];
  if (bucket.length >= limit) {
    const oldest = Math.min(...bucket);
    return {
      ok: false,
      remaining: 0,
      retryAfterMinutes: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 60000)),
    };
  }
  bucket.push(now);
  buckets.set(key, bucket);
  if (buckets.size > 5000) buckets.clear(); // crude memory bound
  return { ok: true, remaining: limit - bucket.length };
}

export function _reset() { buckets.clear(); }
