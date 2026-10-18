import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OpsController } from "../src/ops_controller.js";
import { confirmApply } from "../src/confirm.js";
import { filterProposalsByAllowlist, assertAllowlisted } from "../src/allowlist.js";

const reg = (agent) => ({
  action: "mcp_call",
  tool: "register_schedule",
  args: {
    schedule_id: agent,
    agent_id: agent,
    kind: "interval",
    expression: "60",
    enabled: true,
  },
  requires_confirm: true,
  reason: "test",
});

describe("@op/ops safety gates", () => {
  it("empty allowlist blocks writes", () => {
    const out = filterProposalsByAllowlist([reg("backup")], []);
    assert.equal(out[0].action, "skip");
    assert.equal(out[0].blocked_by_allowlist, true);
  });

  it("allowlist permits listed agent", () => {
    const out = filterProposalsByAllowlist([reg("backup")], ["backup"]);
    assert.equal(out[0].action, "mcp_call");
  });

  it("confirm gate rejects without confirmed", () => {
    const r = confirmApply([reg("a")], { confirmed: false });
    assert.equal(r.status, "rejected");
    assert.equal(r.applied.length, 0);
  });

  it("confirm unlocks mcp_call only", () => {
    const proposals = [
      reg("a"),
      { action: "pending_engine", requires_confirm: true, reason: "fire" },
    ];
    const r = confirmApply(proposals, { confirmed: true, allowPending: false });
    assert.equal(r.applied.length, 1);
    assert.equal(r.blocked.length, 1);
  });

  it("apply without confirm does not call MCP", async () => {
    const ops = new OpsController({ mcpUrl: "http://127.0.0.1:9", allowlist: ["backup"] });
    ops.setProposals([reg("backup")]);
    const result = await ops.apply();
    assert.equal(result.status, "rejected");
    assert.equal(ops.viewModel().confirmRequired, true);
    assert.equal(ops.viewModel().confirmed, false);
  });

  it("viewModel always sets confirmRequired true", () => {
    const ops = new OpsController({ allowlist: ["x"] });
    assert.equal(ops.viewModel().confirmRequired, true);
  });

  it("assertAllowlisted rejects unknown", () => {
    assert.equal(assertAllowlisted("nope", ["backup"]).ok, false);
  });

  it("MCP unavailable surfaces offline health", async () => {
    const ops = new OpsController({
      mcpUrl: "http://127.0.0.1:1",
      allowlist: ["backup"],
    });
    const vm = await ops.refreshSchedules();
    assert.equal(vm.health, "offline");
    assert.ok(vm.last_error);
  });
});
