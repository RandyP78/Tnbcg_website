/* ============================================================
   DNS email-authentication operations (GoDaddy-hosted zones).

   These fix the three things that let someone send mail pretending to
   be the customer: a missing or weak SPF record, a missing or
   duplicated DMARC record, and the absence of a reporting address.
   ============================================================ */

import { defineOperation, RISK } from '../operation.mjs';

const SPF_PREFIX = 'v=spf1';
const DMARC_PREFIX = 'v=DMARC1';

export function findSpf(records) {
  return records.filter(r => r.type === 'TXT' && r.name === '@' &&
    r.data.trim().toLowerCase().startsWith(SPF_PREFIX));
}

export function findDmarc(records) {
  return records.filter(r => r.type === 'TXT' && r.name === '_dmarc' &&
    r.data.trim().toLowerCase().startsWith(DMARC_PREFIX.toLowerCase()));
}

/* ---------------------------------------------------------------
   Duplicate DMARC.

   RFC 7489 §6.6.3: if a domain publishes more than one DMARC record,
   receivers MUST ignore DMARC for that domain entirely. So two records
   both saying p=reject provide exactly no protection — arguably worse
   than one, because the owner believes they are covered.

   This is not hypothetical. tnbcg.com has this exact fault today.
   --------------------------------------------------------------- */
export const dmarcRemoveDuplicates = defineOperation({
  id: 'dns.dmarc.remove_duplicates',
  provider: 'godaddy',
  title: 'Remove duplicate DMARC records',
  rationale:
    'Publishing more than one DMARC record makes receiving mail servers ignore DMARC ' +
    'completely, so the policy you think is protecting you is not being applied at all. ' +
    'Exactly one record must remain.',
  risk: RISK.MEDIUM,
  scopes: ['dns:write'],

  async preconditions(ctx) {
    const records = await ctx.dns.listRecords(ctx.domain);
    const dmarc = findDmarc(records);
    if (dmarc.length === 0) return { ok: false, reason: 'No DMARC record present; nothing to de-duplicate.' };
    if (dmarc.length === 1) return { ok: false, reason: 'Only one DMARC record; already correct.' };
    return { ok: true };
  },

  async plan(ctx) {
    const records = await ctx.dns.listRecords(ctx.domain);
    const dmarc = findDmarc(records);
    const keep = pickBestDmarc(dmarc);
    const drop = dmarc.filter(r => r !== keep);
    return {
      summary:
        `Keep 1 of ${dmarc.length} DMARC records and remove ${drop.length}. ` +
        `Keeping the record with the most complete reporting configuration.`,
      before: dmarc.map(r => r.data),
      after: [keep.data],
    };
  },

  async apply(ctx) {
    const records = await ctx.dns.listRecords(ctx.domain);
    const dmarc = findDmarc(records);
    const keep = pickBestDmarc(dmarc);
    // GoDaddy replaces the whole record set for a given type+name, so we
    // send exactly the one record we intend to survive.
    await ctx.dns.replaceRecords(ctx.domain, 'TXT', '_dmarc', [
      { data: keep.data, ttl: keep.ttl || 3600 },
    ]);
    return {
      undo: { type: 'TXT', name: '_dmarc', records: dmarc.map(r => ({ data: r.data, ttl: r.ttl || 3600 })) },
      detail: `Removed ${dmarc.length - 1} duplicate DMARC record(s).`,
    };
  },

  async verify(ctx) {
    const records = await ctx.dns.listRecords(ctx.domain);
    const dmarc = findDmarc(records);
    if (dmarc.length === 1) return { ok: true };
    return { ok: false, reason: `Expected exactly 1 DMARC record, found ${dmarc.length}.` };
  },

  async undo(ctx, undo) {
    await ctx.dns.replaceRecords(ctx.domain, undo.type, undo.name, undo.records);
  },
});

/** Prefer the record carrying the most reporting addresses, then the longest. */
export function pickBestDmarc(records) {
  return [...records].sort((a, b) => {
    const rua = s => (s.data.match(/mailto:/g) || []).length;
    return rua(b) - rua(a) || b.data.length - a.data.length;
  })[0];
}

/* ---------------------------------------------------------------
   SPF hardening.

   We only ever tighten the qualifier (?all / ~all -> -all) and we never
   invent includes. Adding a sender the customer does not actually use
   is harmless; REMOVING one they do use breaks their mail. So this op
   never removes mechanisms.
   --------------------------------------------------------------- */
export const spfTighten = defineOperation({
  id: 'dns.spf.tighten_all',
  provider: 'godaddy',
  title: 'Tighten the SPF policy to a hard fail',
  rationale:
    'An SPF record ending in ~all or ?all tells receivers to accept mail that fails the ' +
    'check anyway. Ending in -all tells them to reject it, which is what actually stops ' +
    'someone forging your domain.',
  risk: RISK.HIGH,
  scopes: ['dns:write'],

  async preconditions(ctx) {
    const records = await ctx.dns.listRecords(ctx.domain);
    const spf = findSpf(records);
    if (spf.length === 0) return { ok: false, reason: 'No SPF record to tighten.' };
    if (spf.length > 1) {
      return { ok: false, reason: `${spf.length} SPF records found. Multiple SPF records are themselves invalid; resolve that first.` };
    }
    const data = spf[0].data;
    if (/-all\s*$/i.test(data.trim())) return { ok: false, reason: 'SPF already ends in -all.' };
    if (!/[~?+]all\s*$/i.test(data.trim())) {
      return { ok: false, reason: 'SPF record does not end in a recognised all mechanism; needs manual review.' };
    }
    // Refuse if the record is close to the 10-lookup limit — tightening a
    // record that is already failing evaluation makes delivery worse.
    if (countLookups(data) > 10) {
      return { ok: false, reason: 'SPF exceeds the 10 DNS-lookup limit and is already failing evaluation. Flatten it before tightening.' };
    }
    return { ok: true };
  },

  async plan(ctx) {
    const spf = findSpf(await ctx.dns.listRecords(ctx.domain))[0];
    const after = spf.data.trim().replace(/[~?+]all\s*$/i, '-all');
    return { summary: 'Change the final SPF qualifier to -all (hard fail).', before: [spf.data], after: [after] };
  },

  async apply(ctx) {
    const records = await ctx.dns.listRecords(ctx.domain);
    const spf = findSpf(records)[0];
    const after = spf.data.trim().replace(/[~?+]all\s*$/i, '-all');
    const others = records.filter(r => r.type === 'TXT' && r.name === '@' && r !== spf)
      .map(r => ({ data: r.data, ttl: r.ttl || 3600 }));
    await ctx.dns.replaceRecords(ctx.domain, 'TXT', '@',
      [...others, { data: after, ttl: spf.ttl || 3600 }]);
    return { undo: { type: 'TXT', name: '@', records: [...others, { data: spf.data, ttl: spf.ttl || 3600 }] } };
  },

  async verify(ctx) {
    const spf = findSpf(await ctx.dns.listRecords(ctx.domain));
    if (spf.length === 1 && /-all\s*$/i.test(spf[0].data.trim())) return { ok: true };
    return { ok: false, reason: 'SPF record does not end in -all after apply.' };
  },

  async undo(ctx, undo) {
    await ctx.dns.replaceRecords(ctx.domain, undo.type, undo.name, undo.records);
  },
});

/** SPF mechanisms that cost a DNS lookup (RFC 7208 §4.6.4).
 *
 *  Must tokenize rather than substring-match: a naive /\ba\b/ matches the
 *  "a" inside "include:a.com" and over-counts, which would wrongly block
 *  perfectly valid records from being tightened.
 */
export function countLookups(spf) {
  const LOOKUP_MECHANISMS = new Set(['include', 'a', 'mx', 'ptr', 'exists', 'redirect']);
  let count = 0;
  for (const raw of spf.trim().split(/\s+/)) {
    if (/^v=spf1$/i.test(raw)) continue;
    // strip the optional qualifier: + - ~ ?
    const term = raw.replace(/^[+\-~?]/, '');
    // mechanism name is everything before the first ':' or '='
    const name = term.split(/[:=]/)[0].toLowerCase();
    if (LOOKUP_MECHANISMS.has(name)) count++;
  }
  return count;
}

/* ---------------------------------------------------------------
   DMARC introduction, at p=none.

   Deliberately p=none. Going straight to quarantine or reject on a
   domain with no reporting history will silently drop legitimate mail
   from systems the customer forgot about — their invoicing platform,
   their scheduler, their CRM. p=none collects the data first.
   --------------------------------------------------------------- */
export const dmarcCreateMonitoring = defineOperation({
  id: 'dns.dmarc.create_monitoring',
  provider: 'godaddy',
  title: 'Publish a DMARC record in monitoring mode',
  rationale:
    'Without DMARC, SPF and DKIM failures are advisory and nobody is told about them. ' +
    'Starting at p=none changes no delivery behaviour but begins collecting reports, ' +
    'which is what tells you when it is safe to enforce.',
  risk: RISK.LOW,
  scopes: ['dns:write'],

  async preconditions(ctx) {
    const dmarc = findDmarc(await ctx.dns.listRecords(ctx.domain));
    if (dmarc.length > 0) return { ok: false, reason: 'A DMARC record already exists.' };
    if (!ctx.params?.ruaAddress) return { ok: false, reason: 'No aggregate report address configured.' };
    return { ok: true };
  },

  async plan(ctx) {
    const rec = buildDmarc(ctx.params.ruaAddress);
    return { summary: 'Publish a new DMARC record at p=none (monitoring only).', before: [], after: [rec] };
  },

  async apply(ctx) {
    const rec = buildDmarc(ctx.params.ruaAddress);
    await ctx.dns.replaceRecords(ctx.domain, 'TXT', '_dmarc', [{ data: rec, ttl: 3600 }]);
    return { undo: { type: 'TXT', name: '_dmarc', records: [] }, detail: 'DMARC published at p=none.' };
  },

  async verify(ctx) {
    const dmarc = findDmarc(await ctx.dns.listRecords(ctx.domain));
    return dmarc.length === 1 ? { ok: true } : { ok: false, reason: `Expected 1 DMARC record, found ${dmarc.length}.` };
  },

  async undo(ctx, undo) {
    await ctx.dns.replaceRecords(ctx.domain, undo.type, undo.name, undo.records);
  },
});

export function buildDmarc(rua) {
  return `v=DMARC1; p=none; rua=mailto:${rua}; fo=1; adkim=r; aspf=r`;
}

export const dnsOperations = [
  dmarcRemoveDuplicates,
  dmarcCreateMonitoring,
  spfTighten,
];
