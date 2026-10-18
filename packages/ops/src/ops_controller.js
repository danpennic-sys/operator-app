/**
 * OpsController — public surface for shell.
 * Owns: fetch schedules, hold proposals, confirm, apply via MCP.
 * Does not: fire engine, touch PNT, open SQLite.
 */

import { callTool, applyProposals } from "./mcp_client.js";
import { filterProposalsByAllowlist } from "./allowlist.js";
import { confirmApply } from "./confirm.js";

export class OpsController {
  constructor(opts = {}) {
    this.mcpUrl = opts.mcpUrl || process.env.FORCE_MCP_URL || process.env.MCP_URL || null;
    this.allowlist = opts.allowlist || [];
    this.proposals = [];
    this.confirmed = false;
    this.lastError = null;
    this.schedules = [];
    this.health = "unknown";
    this._applyInFlight = false;
  }

  viewModel() {
    return {
      health: this.health,
      mcp_url: this.mcpUrl,
      schedules: this.schedules,
      proposals: this.proposals,
      confirmRequired: true,
      confirmed: this.confirmed,
      last_error: this.lastError,
      allowlist: [...this.allowlist],
    };
  }

  setAllowlist(ids) {
    this.allowlist = (ids || []).map(String);
  }

  setProposals(rawProposals) {
    this.confirmed = false;
    this.proposals = filterProposalsByAllowlist(rawProposals || [], this.allowlist);
    return this.viewModel();
  }

  async refreshSchedules(enabledOnly = false) {
    const r = await callTool(this.mcpUrl, "list_schedules", {
      enabled_only: enabledOnly,
    });

    if (r.status === 0 || r.status < 200 || r.status >= 300) {
      this.health = "offline";
      this.lastError =
        r.body?.error?.message ||
        r.body?.error?.code ||
        (r.status ? `http_${r.status}` : "mcp_unavailable");
      this.schedules = [];
      return this.viewModel();
    }

    if (r.body?.error) {
      this.health = "offline";
      this.lastError = r.body.error.message || r.body.error.code || "store_error";
      this.schedules = [];
      return this.viewModel();
    }

    if (!r.body || typeof r.body !== "object" || !Array.isArray(r.body.schedules)) {
      this.health = "degraded";
      this.lastError = "invalid_schedule_payload";
      this.schedules = [];
      return this.viewModel();
    }

    this.schedules = r.body.schedules
      .filter((s) => s && typeof s === "object" && s.id != null && s.agent_id != null)
      .map((s) => ({
        id: String(s.id),
        agent_id: String(s.agent_id),
        kind: String(s.kind || ""),
        expression: String(s.expression || ""),
        enabled: !!s.enabled,
        group_name: s.group_name == null ? null : String(s.group_name),
        max_concurrent: Number(s.max_concurrent) || 1,
        wait_timeout_secs: Number(s.wait_timeout_secs) || 300,
      }));

    this.health = "ok";
    this.lastError = null;
    return this.viewModel();
  }

  confirm() {
    this.confirmed = true;
    return this.viewModel();
  }

  clearConfirm() {
    this.confirmed = false;
    return this.viewModel();
  }

  async apply() {
    if (this._applyInFlight) {
      return {
        status: "rejected",
        message: "apply_in_flight",
        applied: [],
        blocked: this.proposals,
        results: [],
        view: this.viewModel(),
      };
    }

    const confirmedSnapshot = this.confirmed === true;
    this.confirmed = false;

    const decision = confirmApply(this.proposals, {
      confirmed: confirmedSnapshot,
      allowPending: false,
    });
    if (decision.status === "rejected") {
      this.lastError = decision.message;
      return { ...decision, results: [], view: this.viewModel() };
    }
    if (!this.mcpUrl) {
      this.health = "offline";
      this.lastError = "mcp_unavailable";
      return {
        status: "rejected",
        message: "mcp_unavailable",
        applied: [],
        blocked: this.proposals,
        results: [],
        view: this.viewModel(),
      };
    }

    this._applyInFlight = true;
    try {
      const mcpCalls = decision.applied.filter((a) => a.action === "mcp_call");
      const results = await applyProposals(this.mcpUrl, mcpCalls);
      const failed = results.filter((r) => !r.skipped && !r.ok);
      const applyError = failed.length
        ? failed.map((f) => f.body?.error?.code || "apply_failed").join(",")
        : null;
      await this.refreshSchedules(false);
      if (applyError) {
        this.lastError = applyError;
      }
      return {
        ...decision,
        results,
        view: this.viewModel(),
      };
    } finally {
      this._applyInFlight = false;
    }
  }
}
