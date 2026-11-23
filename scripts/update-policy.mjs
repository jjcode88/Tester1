// Decides whether a Dependabot pull request may be merged without a person
// looking at it. Small updates (patch and minor versions) are merged once the
// full test suite passes; anything that might change behaviour (a major
// version, or a 0.x minor, which semver treats as breaking) waits for review.
//
//   node scripts/update-policy.mjs "<pull request title>"
//   → prints "merge" or "hold: <reason>", exits 0 for merge and 1 for hold.

/** Groups in .github/dependabot.yml that only ever contain minor and patch updates. */
export const SAFE_GROUPS = new Set(['npm-minor-and-patch', 'actions-minor-and-patch']);

function parse(version) {
  const parts = version.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10));
  return parts.every(Number.isFinite) ? parts : null;
}

export function decide(title) {
  const group = title.match(/\bthe (\S+) group\b/);
  if (group && SAFE_GROUPS.has(group[1])) return { merge: true, reason: `${group[1]} only holds minor and patch updates` };

  const bump = title.match(/\bfrom (\S+) to (\S+?)(?:\s|$)/);
  if (!bump) return { merge: false, reason: 'not a single version change this policy understands' };
  const from = parse(bump[1]);
  const to = parse(bump[2]);
  if (!from || !to) return { merge: false, reason: `unrecognised versions ${bump[1]} → ${bump[2]}` };
  if (to[0] !== from[0]) return { merge: false, reason: `major update ${bump[1]} → ${bump[2]}` };
  if (from[0] === 0 && (to[1] ?? 0) !== (from[1] ?? 0)) {
    return { merge: false, reason: `0.x minor update ${bump[1]} → ${bump[2]} can break things` };
  }
  return { merge: true, reason: `minor or patch update ${bump[1]} → ${bump[2]}` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = decide(process.argv[2] ?? '');
  console.log(result.merge ? `merge: ${result.reason}` : `hold: ${result.reason}`);
  process.exit(result.merge ? 0 : 1);
}
