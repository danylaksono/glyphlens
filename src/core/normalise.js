/**
 * Normalisation (`hVarProj`) — and MAUP honesty.
 *
 * A radius slider silently confounds count with area, so this is a pipeline
 * stage rather than a formatting option. `lq` is the one that makes a small
 * lens meaningful: it answers "what is this place unusually full of", which is
 * usually the actual question.
 *
 * Every mode writes `value` (what gets encoded) and leaves `raw` intact, so a
 * tooltip can always show the count behind a normalised bar.
 */

/**
 * @param {Array} bins  output of `bin()`
 * @param {object} spec
 * @param {'count'|'density'|'share'|'lq'|'z'|'delta'} spec.mode
 * @param {number} [spec.areaKm2]              selection area, for `density`
 * @param {Record<string, number>} [spec.baseline]  reference profile, keyed by bin key
 *                                                  (or by category, for cross bins)
 * @param {'zero'|'one'} [spec.centre]         where the neutral value sits
 */
export function normalise(bins, spec = {}) {
  const mode = spec.mode ?? 'count';
  const total = bins.reduce((s, b) => s + b.raw, 0);

  switch (mode) {
    case 'density': {
      return bins.map((b) => {
        const area = b.areaKm2 ?? spec.areaKm2 ?? 1;
        return { ...b, value: area > 0 ? b.raw / area : 0, unit: 'per km²' };
      });
    }

    case 'share': {
      return bins.map((b) => ({
        ...b,
        value: total > 0 ? b.raw / total : 0,
        unit: 'share',
      }));
    }

    case 'lq': {
      // Location quotient: the bin's share here, over its share in the
      // baseline. 1 means "as expected"; 2 means "twice as concentrated".
      const baseline = spec.baseline ?? {};
      const baseTotal = Object.values(baseline).reduce((s, v) => s + v, 0);
      return bins.map((b) => {
        const key = b.category ?? b.key;
        const localShare = total > 0 ? b.raw / total : 0;
        const baseShare = baseTotal > 0 ? (baseline[key] ?? 0) / baseTotal : 0;
        return {
          ...b,
          value: baseShare > 0 ? localShare / baseShare : localShare > 0 ? Infinity : 0,
          neutral: 1,
          unit: 'LQ',
        };
      });
    }

    case 'z': {
      const values = bins.map((b) => b.raw);
      const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
      const sd = Math.sqrt(
        values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length || 1),
      );
      return bins.map((b) => ({
        ...b,
        value: sd > 0 ? (b.raw - mean) / sd : 0,
        neutral: 0,
        unit: 'z',
      }));
    }

    case 'delta': {
      const baseline = spec.baseline ?? {};
      return bins.map((b) => {
        const key = b.category ?? b.key;
        return {
          ...b,
          value: b.raw - (baseline[key] ?? 0),
          neutral: 0,
          unit: 'Δ',
        };
      });
    }

    case 'count':
    default:
      return bins.map((b) => ({ ...b, value: b.raw, unit: 'count' }));
  }
}

/** Build a baseline profile from bins, for `lq`/`delta`/`z` against another lens. */
export function profileOf(bins) {
  const out = {};
  for (const b of bins) {
    const key = b.category ?? b.key;
    out[key] = (out[key] ?? 0) + b.raw;
  }
  return out;
}

/**
 * Weighted within-bin variance, as a confidence channel.
 *
 * After Kawakami et al. (HexTiles, 2024): a bin whose members disagree should
 * not read as confidently as one whose members agree. Returned in [0, 1], where
 * 1 is most confident.
 */
export function confidence(bins, getValue) {
  if (!getValue) return bins.map((b) => ({ ...b, confidence: b.count > 0 ? 1 : 0 }));
  const spreads = bins.map((b) => {
    if (b.count < 2) return 0;
    const vals = b.items.map((it) => getValue(it.feature) ?? 0);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  });
  const maxSpread = Math.max(...spreads, 0);
  return bins.map((b, i) => ({
    ...b,
    confidence: maxSpread > 0 ? 1 - spreads[i] / maxSpread : b.count > 0 ? 1 : 0,
  }));
}
