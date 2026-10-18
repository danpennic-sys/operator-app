import { OpsController } from "../../packages/ops/src/index.js";

export function createOpsTab(opts = {}) {
  const ops = new OpsController({
    mcpUrl: opts.mcpUrl || process.env.FORCE_MCP_URL,
    allowlist: opts.allowlist || [],
  });

  return {
    id: "ops",
    title: "Operations",
    getViewModel: () => ops.viewModel(),
    refresh: () => ops.refreshSchedules(false),
    setProposals: (p) => ops.setProposals(p),
    confirm: () => ops.confirm(),
    apply: () => ops.apply(),
    setAllowlist: (ids) => ops.setAllowlist(ids),
  };
}
