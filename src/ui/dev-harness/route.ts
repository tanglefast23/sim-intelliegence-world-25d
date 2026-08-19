const HASH_PREFIX = 'dev';

export interface DevHarnessRoute {
  readonly entryId?: string;
  readonly caseId?: string;
}

export interface DevHarnessRoutableEntry {
  readonly id: string;
  readonly group: string;
  readonly cases: readonly { readonly id: string }[];
}

export type DevHarnessResolution =
  | Readonly<{ kind: 'menu' }>
  | Readonly<{ kind: 'entry'; entryId: string; caseId: string }>;

export function parseDevHarnessHash(hash: string): DevHarnessRoute {
  const segments = hash
    .replace(/^#/u, '')
    .split('/')
    .map(safeDecode)
    .filter((segment) => segment.length > 0);
  if (segments[0] !== HASH_PREFIX) return {};
  const [, entryId, caseId] = segments;
  if (entryId === undefined) return {};
  return caseId === undefined ? { entryId } : { entryId, caseId };
}

export function formatDevHarnessHash(route: DevHarnessRoute): string {
  if (route.entryId === undefined) return `#/${HASH_PREFIX}`;
  if (route.caseId === undefined) return `#/${HASH_PREFIX}/${encodeURIComponent(route.entryId)}`;
  return `#/${HASH_PREFIX}/${encodeURIComponent(route.entryId)}/${encodeURIComponent(route.caseId)}`;
}

export function resolveDevHarnessRoute(
  entries: readonly DevHarnessRoutableEntry[],
  route: DevHarnessRoute,
): DevHarnessResolution {
  if (route.entryId === undefined) {
    const only = entries[0];
    const firstCase = only?.cases[0];
    if (entries.length === 1 && only && firstCase) {
      return { kind: 'entry', entryId: only.id, caseId: firstCase.id };
    }
    return { kind: 'menu' };
  }
  const entry = entries.find((candidate) => candidate.id === route.entryId);
  const firstCase = entry?.cases[0];
  if (!entry || !firstCase) return { kind: 'menu' };
  if (route.caseId === undefined) {
    return { kind: 'entry', entryId: entry.id, caseId: firstCase.id };
  }
  return entry.cases.some((candidate) => candidate.id === route.caseId)
    ? { kind: 'entry', entryId: entry.id, caseId: route.caseId }
    : { kind: 'menu' };
}

export function resolvedDevHarnessRoute(resolution: DevHarnessResolution): DevHarnessRoute {
  return resolution.kind === 'menu'
    ? {}
    : { entryId: resolution.entryId, caseId: resolution.caseId };
}

export type DevHarnessGroup<Entry> = Readonly<{
  name: string;
  entries: readonly Entry[];
}>;

export function devHarnessGroups<Entry extends { readonly group: string }>(
  entries: readonly Entry[],
): readonly DevHarnessGroup<Entry>[] {
  const grouped = new Map<string, Entry[]>();
  for (const entry of entries) {
    const existing = grouped.get(entry.group);
    if (existing) existing.push(entry);
    else grouped.set(entry.group, [entry]);
  }
  return [...grouped].map(([name, groupEntries]) => ({ name, entries: groupEntries }));
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
