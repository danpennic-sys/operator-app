export function assertAllowlisted(agentId, allowlist) {
  const id = String(agentId || "");
  const list = Array.isArray(allowlist) ? allowlist.map(String) : [];
  if (!id) return { ok: false, reason: "missing agent_id" };
  if (list.length === 0) return { ok: false, reason: "allowlist empty — writes blocked" };
  if (!list.includes(id)) return { ok: false, reason: `agent_id not allowlisted: ${id}` };
  return { ok: true };
}

export function filterProposalsByAllowlist(proposals, allowlist) {
  return proposals.map((p) => {
    if (p.action !== "mcp_call") return p;
    const args = p.args || {};
    const agent = args.agent_id || args.schedule_id;
    if (
      p.tool === "list_schedules" ||
      p.tool === "export_snapshot" ||
      p.tool === "get_completed" ||
      p.tool === "get_schedule" ||
      p.tool === "get_consumed" ||
      p.tool === "dependencies_satisfied"
    ) {
      return p;
    }
    const check = assertAllowlisted(agent, allowlist);
    if (!check.ok) {
      return {
        ...p,
        action: "skip",
        requires_confirm: false,
        reason: check.reason,
        blocked_by_allowlist: true,
      };
    }
    return p;
  });
}
