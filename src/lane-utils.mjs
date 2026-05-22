/** Flatten nested lane trees from board layout. */
export function flattenLanes(lanes) {
  const out = [];
  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const lane of nodes) {
      const title = String(lane.name ?? lane.title ?? "").trim();
      out.push({
        id: String(lane.id),
        title,
        description: lane.description,
        wipLimit: lane.wipLimit,
        cardStatus: lane.cardStatus,
        parentLaneId: lane.parentLaneId != null ? String(lane.parentLaneId) : null,
        isDefaultDropLane: !!lane.isDefaultDropLane,
      });
      if (Array.isArray(lane.children) && lane.children.length > 0) {
        walk(lane.children);
      }
    }
  }
  walk(lanes);
  return out;
}

/**
 * Find lanes whose title matches namePattern (case-insensitive substring).
 * Set exact=true for case-insensitive full title match.
 */
export function findLanesByName(lanes, namePattern, { exact = false } = {}) {
  const pattern = String(namePattern ?? "").trim().toLowerCase();
  if (!pattern) return [];
  return flattenLanes(lanes).filter(l => {
    const t = l.title.toLowerCase();
    return exact ? t === pattern : t.includes(pattern);
  });
}

/**
 * Resolve a single lane id from laneId or laneName against a board's lane tree.
 */
export function resolveLaneId(lanes, { laneId, laneName }) {
  if (laneId) return String(laneId);
  if (!laneName) return null;
  const matches = findLanesByName(lanes, laneName);
  if (matches.length === 0) {
    throw new Error(`No lane matching "${laneName}". Use listLanes or findLane to see lane titles.`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple lanes match "${laneName}": ${matches.map(m => `${m.title} (${m.id})`).join(", ")}. Use laneId or a more specific laneName.`
    );
  }
  return matches[0].id;
}

/** Return the board's default drop lane id, if marked on a lane. */
export function getDefaultDropLaneId(lanes) {
  const flat = flattenLanes(lanes);
  const drop = flat.find(l => l.isDefaultDropLane);
  return drop?.id ?? null;
}
