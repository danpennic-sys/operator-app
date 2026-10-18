export function confirmApply(proposals, decision) {
  if (!decision || decision.confirmed !== true) {
    return {
      applied: [],
      blocked: proposals,
      status: "rejected",
      message: "confirm required — no MCP calls issued",
    };
  }
  const applied = [];
  const blocked = [];
  for (const p of proposals) {
    if (p.action === "skip") {
      blocked.push({ ...p, block_reason: "skip" });
      continue;
    }
    if (p.action === "pending_engine" && !decision.allowPending) {
      blocked.push({ ...p, block_reason: "pending_engine" });
      continue;
    }
    if (p.action === "mcp_call") {
      applied.push(p);
    } else if (p.action === "pending_engine" && decision.allowPending) {
      applied.push(p);
    } else {
      blocked.push({ ...p, block_reason: p.action });
    }
  }
  return {
    applied,
    blocked,
    status: "confirmed",
    message: `ready to issue ${applied.filter((a) => a.action === "mcp_call").length} MCP call(s)`,
  };
}
