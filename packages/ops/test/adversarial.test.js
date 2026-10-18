/**
 * Release-gate tests: real OpsController + real mcp_client.
 * fetch stubbed only at network edge.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OpsController } from "../src/ops_controller.js";

const reg = (agent, expr = "60") => ({
  action: "mcp_call",
  tool: "register_schedule",
  args: {
    schedule_id: agent,
    agent_id: agent,
    kind: "interval",
    expression: expr,
    enabled: true,
  },
  requires_confirm: true,
  reason: "test-register",
});

describe("release gate: confirmation bypass", () => {
  it("apply without confirm issues zero MCP calls", async () => {
    let fetchCount = 0;
    const orig = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    try {
      const ops = new OpsController({
        mcpUrl: "http://127.0.0.1:8787",
        allowlist: ["backup"],
      });
      ops.setProposals([reg("backup")]);
      assert.equal(ops.viewModel().confirmed, false);
      const result = await ops.apply();
      assert.equal(result.status, "rejected");
      assert.equal(result.applied.length, 0);
      assert.equal(fetchCount, 0, "fetch must not run without confirm");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("confirmRequired stays true even after confirm()", () => {
    const ops = new OpsController({ allowlist: ["a"] });
    ops.confirm();
    assert.equal(ops.viewModel().confirmed, true);
    assert.equal(ops.viewModel().confirmRequired, true);
  });
});

describe("release gate: malformed MCP responses", () => {
  it("missing id/agent_id rows are dropped; not trusted as schedules", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          schedules: [
            { id: "ok", agent_id: "ok", kind: "interval", expression: "30", enabled: true },
            { agent_id: "no-id", kind: "interval", expression: "1" },
            { id: "no-agent", kind: "interval", expression: "1" },
            null,
            "garbage",
          ],
        }),
        { status: 200 }
      );
    try {
      const ops = new OpsController({ mcpUrl: "http://127.0.0.1:8787" });
      const vm = await ops.refreshSchedules();
      assert.equal(vm.health, "ok");
      assert.equal(vm.schedules.length, 1);
      assert.equal(vm.schedules[0].id, "ok");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("non-object body does not yield trusted schedule list", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ schedules: "not-an-array" }), { status: 200 });
    try {
      const ops = new OpsController({ mcpUrl: "http://127.0.0.1:8787" });
      const vm = await ops.refreshSchedules();
      assert.equal(vm.schedules.length, 0);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("error payload sets last_error and clears schedules", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: { code: "store_error", message: "boom" } }),
        { status: 200 }
      );
    try {
      const ops = new OpsController({ mcpUrl: "http://127.0.0.1:8787" });
      ops.schedules = [{ id: "stale", agent_id: "stale", kind: "x", expression: "1", enabled: true }];
      const vm = await ops.refreshSchedules();
      assert.equal(vm.health, "offline");
      assert.equal(vm.schedules.length, 0);
      assert.ok(vm.last_error);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("release gate: MCP unavailable", () => {
  it("connection failure reports offline, not success", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    try {
      const ops = new OpsController({ mcpUrl: "http://127.0.0.1:1" });
      const vm = await ops.refreshSchedules();
      assert.equal(vm.health, "offline");
      assert.equal(vm.schedules.length, 0);
      assert.match(String(vm.last_error), /ECONNREFUSED|mcp_unavailable/i);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("apply with confirm but no mcpUrl does not succeed", async () => {
    const ops = new OpsController({ mcpUrl: null, allowlist: ["backup"] });
    ops.setProposals([reg("backup")]);
    ops.confirm();
    const result = await ops.apply();
    assert.equal(result.status, "rejected");
    assert.equal(result.message, "mcp_unavailable");
    assert.equal(ops.viewModel().health, "offline");
  });
});

describe("release gate: duplicate apply", () => {
  it("second apply without re-confirm does not fetch again", async () => {
    let fetchCount = 0;
    const orig = globalThis.fetch;
    globalThis.fetch = async (url) => {
      fetchCount += 1;
      const u = String(url);
      if (u.includes("register_schedule")) {
        return new Response(
          JSON.stringify({ schedule_id: "backup", persisted: true }),
          { status: 200 }
        );
      }
      if (u.includes("list_schedules")) {
        return new Response(
          JSON.stringify({
            schedules: [
              {
                id: "backup",
                agent_id: "backup",
                kind: "interval",
                expression: "60",
                enabled: true,
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };
    try {
      const ops = new OpsController({
        mcpUrl: "http://127.0.0.1:8787",
        allowlist: ["backup"],
      });
      ops.setProposals([reg("backup")]);
      ops.confirm();
      const first = await ops.apply();
      assert.equal(first.status, "confirmed");
      const writes = first.results.filter((r) => r.tool === "register_schedule");
      assert.equal(writes.length, 1);
      assert.equal(writes[0].ok, true);
      assert.equal(ops.viewModel().confirmed, false);
      const countAfterFirst = fetchCount;
      const second = await ops.apply();
      assert.equal(second.status, "rejected");
      assert.equal(fetchCount, countAfterFirst, "no extra MCP traffic on duplicate apply");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("store already_registered surfaces as failed result, not silent success", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url).includes("register_schedule")) {
        return new Response(
          JSON.stringify({
            error: { code: "already_registered", message: "backup" },
          }),
          { status: 200 }
        );
      }
      if (String(url).includes("list_schedules")) {
        return new Response(JSON.stringify({ schedules: [] }), { status: 200 });
      }
      return new Response("{}");
    };
    try {
      const ops = new OpsController({
        mcpUrl: "http://127.0.0.1:8787",
        allowlist: ["backup"],
      });
      ops.setProposals([reg("backup")]);
      ops.confirm();
      const result = await ops.apply();
      const write = result.results.find((r) => r.tool === "register_schedule");
      assert.ok(write);
      assert.equal(write.ok, false);
      assert.equal(write.body.error.code, "already_registered");
      assert.ok(ops.viewModel().last_error);
    } finally {
      globalThis.fetch = orig;
    }
  });
});
