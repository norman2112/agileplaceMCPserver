import { z } from "zod";
import { CONFIG, configSourceLabel } from "../config.mjs";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import {
  getBoard,
  getLaneCardCounts,
  updateBoardLayoutApi,
  updateLaneApi,
} from "../api/agileplace.mjs";

const { DEFAULT_BOARD_ID } = CONFIG;

async function getBoardLayoutWithChecksum(boardId) {
  const board = await getBoard(boardId);
  const lanes = Array.isArray(board.lanes) ? board.lanes : [];
  const layoutChecksum =
    board.layoutChecksum || board.laneLayoutChecksum || board.checksum;
  return { lanes, layoutChecksum };
}

function reindexLanes(lanes) {
  if (!Array.isArray(lanes)) return;
  lanes.forEach((lane, index) => {
    lane.index = index;
    if (Array.isArray(lane.children) && lane.children.length > 0) {
      reindexLanes(lane.children);
    }
  });
}

function findLaneInTree(lanes, laneId) {
  if (!Array.isArray(lanes)) return null;
  for (const lane of lanes) {
    if (String(lane.id) === String(laneId)) {
      return { lane, parent: null, siblings: lanes };
    }
    if (Array.isArray(lane.children) && lane.children.length > 0) {
      const found = findLaneInTree(lane.children, laneId);
      if (found) {
        if (!found.siblings) found.siblings = lane.children;
        if (!found.parent) found.parent = lane;
        return found;
      }
    }
  }
  return null;
}

async function mutateBoardLayoutWithRetry(boardId, mutator) {
  let { lanes, layoutChecksum } = await getBoardLayoutWithChecksum(boardId);
  let layout = { lanes: JSON.parse(JSON.stringify(lanes)), layoutChecksum };
  layout = await mutator(layout);
  try {
    return await updateBoardLayoutApi(boardId, layout);
  } catch (err) {
    const message = err?.message || "";
    if (!/409|412|checksum/i.test(message)) {
      throw err;
    }
    ({ lanes, layoutChecksum } = await getBoardLayoutWithChecksum(boardId));
    layout = { lanes: JSON.parse(JSON.stringify(lanes)), layoutChecksum };
    layout = await mutator(layout);
    return await updateBoardLayoutApi(boardId, layout);
  }
}

// ---------------------------------------------------------------------------
// Layout normalization — auto-correct lane trees before sending to the API
// ---------------------------------------------------------------------------

const CLASS_TYPE_CARD_STATUS = {
  backlog: "notStarted",
  active: "started",
  archive: "finished",
};

/**
 * Recursively normalize a lane tree so it satisfies the AgilePlace
 * PUT /io/board/:boardId/layout column/orientation constraints.
 *
 * Rules enforced:
 *  - Default missing orientation to "vertical"
 *  - Default missing columns to 1
 *  - Auto-set index on children based on array position
 *  - Default missing classType to parent's classType
 *  - Default missing cardStatus based on classType
 *  - Horizontal parent → every child.columns = parent.columns
 *  - Vertical parent → sum(children.columns) must equal parent.columns;
 *    redistribute proportionally if it doesn't
 */
function normalizeLayoutTree(lanes, parentColumns = null, parentClassType = null) {
  if (!Array.isArray(lanes)) return [];

  return lanes.map((lane, idx) => {
    const normalized = { ...lane };

    // Defaults
    if (!normalized.orientation) normalized.orientation = "vertical";
    if (typeof normalized.columns !== "number" || normalized.columns < 1) normalized.columns = 1;
    normalized.index = idx;

    if (!normalized.classType && parentClassType) {
      normalized.classType = parentClassType;
    }
    if (!normalized.cardStatus && normalized.classType && CLASS_TYPE_CARD_STATUS[normalized.classType]) {
      normalized.cardStatus = CLASS_TYPE_CARD_STATUS[normalized.classType];
    }

    // If this lane was given a parentColumns constraint (i.e. it's a child),
    // that constraint was already applied by the parent's logic below.
    // Now handle *this* lane's children.
    const children = Array.isArray(normalized.children) ? normalized.children : [];
    if (children.length > 0) {
      // In AgilePlace's layout model:
      //   orientation="horizontal" → children stack as rows (each child full-width = parent columns)
      //   orientation="vertical"   → children sit side-by-side (columns sum to parent columns)
      //
      // Detect user intent for side-by-side (vertical) children under a
      // horizontal parent. Two signals:
      //   1. Any child explicitly set to orientation="vertical"
      //   2. Any child has a columns value that differs from the parent
      const hasExplicitVerticalChild = children.some(c => c.orientation === "vertical");
      const hasColumnSplit = children.some(c =>
        typeof c.columns === "number" && c.columns > 0 && c.columns !== normalized.columns
      );

      // Determine effective layout mode for children
      let effectiveMode;
      if (hasExplicitVerticalChild || hasColumnSplit) {
        // User wants side-by-side children → columns must sum to parent
        effectiveMode = "vertical";
      } else {
        effectiveMode = normalized.orientation;
      }

      if (effectiveMode === "horizontal") {
        // Rows: every child gets the same columns as parent (full width)
        const fixed = children.map(c => ({ ...c, columns: normalized.columns }));
        normalized.children = normalizeLayoutTree(fixed, normalized.columns, normalized.classType);
      } else {
        // Side-by-side: children's columns must sum to parent's columns
        redistributeChildColumns(children, normalized.columns);
        normalized.children = normalizeLayoutTree(children, normalized.columns, normalized.classType);
      }
    } else {
      normalized.children = [];
    }

    return normalized;
  });
}

/**
 * Redistribute children columns so they sum to parentColumns.
 * Mutates the children array in place.
 */
function redistributeChildColumns(children, parentColumns) {
  if (children.length === 0) return;

  // Ensure every child has a numeric columns value
  children.forEach(c => {
    if (typeof c.columns !== "number" || c.columns < 1) c.columns = 1;
  });

  const currentSum = children.reduce((s, c) => s + c.columns, 0);
  if (currentSum === parentColumns) return; // already correct

  // Proportional redistribution
  const scale = parentColumns / currentSum;
  let distributed = children.map(c => Math.max(1, Math.round(c.columns * scale)));

  // Fix rounding drift
  let drift = distributed.reduce((s, v) => s + v, 0) - parentColumns;
  // Adjust largest values first to absorb drift
  const sortedIndices = distributed
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v)
    .map(x => x.i);

  let adjustIdx = 0;
  while (drift !== 0) {
    const i = sortedIndices[adjustIdx % sortedIndices.length];
    if (drift > 0 && distributed[i] > 1) {
      distributed[i]--;
      drift--;
    } else if (drift < 0) {
      distributed[i]++;
      drift++;
    } else {
      break;
    }
    adjustIdx++;
    // Safety: avoid infinite loop if can't resolve
    if (adjustIdx > children.length * parentColumns) break;
  }

  children.forEach((c, i) => {
    c.columns = distributed[i];
  });
}

/**
 * Validate layout tree AFTER normalization. Returns an array of error strings.
 * If errors remain, we return them to the caller instead of a cryptic 422.
 */
function validateLayoutTree(lanes, parentColumns = null, path = "root") {
  const errors = [];
  if (!Array.isArray(lanes)) return errors;

  lanes.forEach((lane, idx) => {
    const loc = `${path}[${idx}]${lane.title ? ` ("${lane.title}")` : ""}`;
    const children = Array.isArray(lane.children) ? lane.children : [];

    if (children.length === 0) return;

    if (lane.orientation === "horizontal") {
      // Every child must match parent columns
      children.forEach((child, ci) => {
        if (child.columns !== lane.columns) {
          errors.push(
            `${loc} → child[${ci}]: horizontal parent has columns=${lane.columns} but child has columns=${child.columns}. They must match.`
          );
        }
      });
    } else {
      // Vertical: sum of children columns must equal parent columns
      const sum = children.reduce((s, c) => s + (c.columns || 1), 0);
      if (sum !== lane.columns) {
        errors.push(
          `${loc}: vertical parent has columns=${lane.columns} but ${children.length} children sum to ${sum} columns. ` +
          `Cannot split ${lane.columns} column(s) into ${children.length} children (each needs at least 1). ` +
          `Fix: set parent columns ≥ ${children.length}, or reduce the number of children.`
        );
      }
    }

    // Recurse
    errors.push(...validateLayoutTree(children, lane.columns, `${loc}.children`));
  });

  return errors;
}

export function registerLaneTools(mcp) {
  // List lanes
  mcp.registerTool(
    "listLanes",
    {
      description:
        "List lanes for a board. Extracts lane data from board details. Returns id, title, description, wipLimit, cardStatus, parentLaneId.",
      inputSchema: {
        boardId: z.string().optional(),
      },
    },
    wrapToolHandler("listLanes", async ({ boardId }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error(
          `Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`
        );
      }
      const board = await getBoard(resolvedBoardId);
      const lanes = board.lanes || [];
      const summary = lanes.map(l => ({
        id: l.id,
        title: l.name ?? l.title,
        description: l.description,
        wipLimit: l.wipLimit,
        cardStatus: l.cardStatus,
        parentLaneId: l.parentLaneId,
      }));
      return respondText(
        `Found ${summary.length} lane(s) on board ${resolvedBoardId}`,
        summary
          .map(l => `ID: ${l.id} | ${l.title} | ${l.cardStatus || ""}`)
          .join("\n"),
        `JSON:\n${JSON.stringify(summary, null, 2)}`
      );
    })
  );

  // Update lane
  mcp.registerTool(
    "updateLane",
    {
      description:
        "Update a lane. Partial updates - only include fields to change. Supported: title, description, wipLimit, isDefaultDropLane, cardStatus (notStarted/started/finished).",
      inputSchema: {
        boardId: z.string(),
        laneId: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        wipLimit: z.number().optional(),
        isDefaultDropLane: z.boolean().optional(),
        cardStatus: z.enum(["notStarted", "started", "finished"]).optional(),
      },
    },
    wrapToolHandler(
      "updateLane",
      async ({ boardId, laneId, title, description, wipLimit, isDefaultDropLane, cardStatus }) => {
        const lane = await updateLaneApi(boardId, laneId, {
          title,
          description,
          wipLimit,
          isDefaultDropLane,
          cardStatus,
        });
        return respondText(
          `Updated lane ${laneId}`,
          JSON.stringify(lane, null, 2)
        );
      }
    )
  );

  // Get full board layout
  mcp.registerTool(
    "getBoardLayout",
    {
      description:
        "Get the full lane layout object for a board, including layoutChecksum. Useful for snapshotting and env rebuild.",
      inputSchema: {
        boardId: z.string().optional(),
      },
    },
    wrapToolHandler("getBoardLayout", async ({ boardId }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error(
          `Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`
        );
      }
      const layout = await getBoardLayoutWithChecksum(resolvedBoardId);
      return respondText(
        `Layout for board ${resolvedBoardId}`,
        JSON.stringify(layout, null, 2)
      );
    })
  );

  // Add lane
  mcp.registerTool(
    "addLane",
    {
      description:
        "Add a new lane to a board at a specified position (optionally as a child of another lane).",
      inputSchema: {
        boardId: z.string(),
        title: z.string(),
        classType: z.enum(["backlog", "active", "archive"]),
        parentLaneId: z.string().optional(),
        index: z.number().optional(),
        columns: z.number().min(1).max(3).optional(),
        orientation: z.enum(["vertical", "horizontal"]).optional(),
        wipLimit: z.number().optional(),
        description: z.string().optional(),
        cardStatus: z.enum(["notStarted", "started", "finished"]).optional(),
        isDefaultDropLane: z.boolean().optional(),
      },
    },
    wrapToolHandler(
      "addLane",
      async ({
        boardId,
        title,
        classType,
        parentLaneId,
        index,
        columns,
        orientation,
        wipLimit,
        description,
        cardStatus,
        isDefaultDropLane,
      }) => {
        const typeMap = {
          backlog: "ready",
          active: "inProcess",
          archive: "completed",
        };
        const laneType = typeMap[classType];
        const newLane = {
          title,
          type: laneType,
          classType,
          index: typeof index === "number" ? index : 0,
          columns: typeof columns === "number" ? columns : 1,
          orientation: orientation || "vertical",
          isConnectionDoneLane: false,
          isDefaultDropLane: !!isDefaultDropLane,
          children: [],
          wipLimit: typeof wipLimit === "number" ? wipLimit : 0,
          description: description ?? null,
          cardStatus: cardStatus || undefined,
        };

        const result = await mutateBoardLayoutWithRetry(
          boardId,
          async layout => {
            const lanes = layout.lanes || [];
            if (parentLaneId) {
              const found = findLaneInTree(lanes, parentLaneId);
              if (!found) {
                throw new Error(
                  `Parent lane ${parentLaneId} not found on board ${boardId}.`
                );
              }
              if (!Array.isArray(found.lane.children)) {
                found.lane.children = [];
              }
              const siblings = found.lane.children;
              const insertIndex =
                typeof index === "number" &&
                index >= 0 &&
                index <= siblings.length
                  ? index
                  : siblings.length;
              siblings.splice(insertIndex, 0, newLane);
              reindexLanes(siblings);
            } else {
              const siblings = lanes;
              const insertIndex =
                typeof index === "number" &&
                index >= 0 &&
                index <= siblings.length
                  ? index
                  : siblings.length;
              siblings.splice(insertIndex, 0, newLane);
              reindexLanes(siblings);
            }
            layout.lanes = lanes;
            return layout;
          }
        );

        return respondText(
          `Added lane "${title}" to board ${boardId}`,
          JSON.stringify(result, null, 2)
        );
      }
    )
  );

  // Remove lane
  mcp.registerTool(
    "removeLane",
    {
      description:
        "Remove a lane from a board. Refuses if the lane contains cards or child lanes unless force=true.",
      inputSchema: {
        boardId: z.string(),
        laneId: z.string(),
        force: z.boolean().optional(),
      },
    },
    wrapToolHandler(
      "removeLane",
      async ({ boardId, laneId, force }) => {
        const { lanes } = await getBoardLayoutWithChecksum(boardId);
        const found = findLaneInTree(lanes, laneId);
        if (!found) {
          throw new Error(`Lane ${laneId} not found on board ${boardId}.`);
        }
        const lane = found.lane;
        if (
          Array.isArray(lane.children) &&
          lane.children.length > 0 &&
          !force
        ) {
          throw new Error(
            "Lane has child lanes. Use force=true to remove lane and all children."
          );
        }

        const laneCounts = await getLaneCardCounts(boardId, laneId);
        const countEntry = Array.isArray(laneCounts.lanes)
          ? laneCounts.lanes.find(l => String(l.id) === String(laneId))
          : laneCounts;
        const cardCount = countEntry?.cardCount ?? countEntry?.cards ?? 0;
        if (cardCount && cardCount > 0) {
          throw new Error(
            `Lane contains ${cardCount} card(s). Move or delete cards first before removing this lane.`
          );
        }

        const result = await mutateBoardLayoutWithRetry(
          boardId,
          async layout => {
            const rootLanes = layout.lanes || [];
            const target = findLaneInTree(rootLanes, laneId);
            if (!target) {
              throw new Error(
                `Lane ${laneId} not found during layout mutation.`
              );
            }
            const siblings = target.siblings || rootLanes;
            const idx = siblings.findIndex(
              l => String(l.id) === String(laneId)
            );
            if (idx === -1) {
              throw new Error(
                `Lane ${laneId} not found in siblings array.`
              );
            }
            siblings.splice(idx, 1);
            reindexLanes(siblings);
            layout.lanes = rootLanes;
            return layout;
          }
        );

        return respondText(
          `Removed lane ${laneId} from board ${boardId}`,
          JSON.stringify(result, null, 2)
        );
      }
    )
  );

  // Move lane
  mcp.registerTool(
    "moveLane",
    {
      description:
        "Move a lane to a new position or parent within the board's lane tree.",
      inputSchema: {
        boardId: z.string(),
        laneId: z.string(),
        newParentLaneId: z.string().nullable().optional(),
        newIndex: z.number().optional(),
      },
    },
    wrapToolHandler(
      "moveLane",
      async ({ boardId, laneId, newParentLaneId, newIndex }) => {
        const result = await mutateBoardLayoutWithRetry(
          boardId,
          async layout => {
            const rootLanes = layout.lanes || [];
            const found = findLaneInTree(rootLanes, laneId);
            if (!found) {
              throw new Error(
                `Lane ${laneId} not found on board ${boardId}.`
              );
            }

            const fromSiblings = found.siblings || rootLanes;
            const fromIndex = fromSiblings.findIndex(
              l => String(l.id) === String(laneId)
            );
            if (fromIndex === -1) {
              throw new Error(
                `Lane ${laneId} not found in its siblings while moving.`
              );
            }
            const [lane] = fromSiblings.splice(fromIndex, 1);
            reindexLanes(fromSiblings);

            if (newParentLaneId) {
              const newParent = findLaneInTree(rootLanes, newParentLaneId);
              if (!newParent) {
                throw new Error(
                  `New parent lane ${newParentLaneId} not found on board ${boardId}.`
                );
              }
              if (!Array.isArray(newParent.lane.children)) {
                newParent.lane.children = [];
              }
              const toSiblings = newParent.lane.children;
              const insertIndex =
                typeof newIndex === "number" &&
                newIndex >= 0 &&
                newIndex <= toSiblings.length
                  ? newIndex
                  : toSiblings.length;
              toSiblings.splice(insertIndex, 0, lane);
              reindexLanes(toSiblings);
            } else {
              const toSiblings = rootLanes;
              const insertIndex =
                typeof newIndex === "number" &&
                newIndex >= 0 &&
                newIndex <= toSiblings.length
                  ? newIndex
                  : toSiblings.length;
              toSiblings.splice(insertIndex, 0, lane);
              reindexLanes(toSiblings);
            }

            layout.lanes = rootLanes;
            return layout;
          }
        );

        return respondText(
          `Moved lane ${laneId} on board ${boardId}`,
          JSON.stringify(result, null, 2)
        );
      }
    )
  );

  // Resize lane
  mcp.registerTool(
    "resizeLane",
    {
      description:
        "Change lane width (columns: 1-3) using the layout endpoint.",
      inputSchema: {
        boardId: z.string(),
        laneId: z.string(),
        columns: z.number().min(1).max(3),
      },
    },
    wrapToolHandler(
      "resizeLane",
      async ({ boardId, laneId, columns }) => {
        const result = await mutateBoardLayoutWithRetry(
          boardId,
          async layout => {
            const rootLanes = layout.lanes || [];
            const found = findLaneInTree(rootLanes, laneId);
            if (!found) {
              throw new Error(
                `Lane ${laneId} not found on board ${boardId}.`
              );
            }
            found.lane.columns = columns;
            layout.lanes = rootLanes;
            return layout;
          }
        );

        return respondText(
          `Resized lane ${laneId} to columns=${columns} on board ${boardId}`,
          JSON.stringify(result, null, 2)
        );
      }
    )
  );

  // Clone board layout
  mcp.registerTool(
    "cloneBoardLayout",
    {
      description: [
        "Replace a board's lane layout with a provided layout snapshot. Strips all lane IDs so new IDs are assigned. WARNING: replaces ALL existing lanes.",
        "",
        "IMPORTANT layout rules (auto-corrected when possible, rejected if not):",
        "• Every lane needs: orientation (\"vertical\"|\"horizontal\", default \"vertical\"), columns (number ≥1, default 1), classType (\"backlog\"|\"active\"|\"archive\").",
        "• cardStatus is auto-set from classType: backlog→\"notStarted\", active→\"started\", archive→\"finished\".",
        "• Children indexes are auto-set from array position.",
        "• Horizontal parent: all children MUST have columns equal to the parent's columns.",
        "• Vertical parent: sum of children columns MUST equal parent columns. If it doesn't, columns are redistributed proportionally.",
        "• If parent has columns=1 but multiple vertical children, that's unsolvable (can't split 1 into N≥2). Set parent columns ≥ number of vertical children.",
      ].join("\n"),
      inputSchema: {
        boardId: z.string(),
        layout: z.object({
          lanes: z.array(z.any()),
        }),
      },
    },
    wrapToolHandler(
      "cloneBoardLayout",
      async ({ boardId, layout }) => {
        const stripIds = lanes => {
          if (!Array.isArray(lanes)) return [];
          return lanes.map(lane => {
            const { id, children, ...rest } = lane;
            const cloned = { ...rest };
            cloned.children = stripIds(children || []);
            return cloned;
          });
        };

        let newLanes = stripIds(layout.lanes || []);
        newLanes = normalizeLayoutTree(newLanes);
        reindexLanes(newLanes);

        // Validate after normalization — catch unsolvable problems early
        const validationErrors = validateLayoutTree(newLanes);
        if (validationErrors.length > 0) {
          return respondText(
            "Layout validation failed — the API would reject this layout with a 422.",
            "The following structural problems could not be auto-corrected:",
            validationErrors.map((e, i) => `  ${i + 1}. ${e}`).join("\n"),
            "Fix the layout and retry."
          );
        }

        const result = await mutateBoardLayoutWithRetry(
          boardId,
          async current => {
            current.lanes = newLanes;
            return current;
          }
        );

        return respondText(
          `Cloned layout onto board ${boardId} (all existing lanes replaced)`,
          JSON.stringify(result, null, 2)
        );
      }
    )
  );
}

