export async function callTool(baseUrl, tool, args = {}) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  if (!base) {
    return {
      status: 0,
      body: { error: { code: "mcp_unavailable", message: "FORCE_MCP_URL / mcp_url not set" } },
    };
  }
  try {
    const res = await fetch(`${base}/tools/${encodeURIComponent(tool)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args ?? {}),
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: { code: "bad_response", message: text.slice(0, 200) } };
    }
    return { status: res.status, body };
  } catch (e) {
    return {
      status: 0,
      body: {
        error: {
          code: "mcp_unavailable",
          message: e instanceof Error ? e.message : String(e),
        },
      },
    };
  }
}

export async function applyProposals(baseUrl, proposals) {
  const results = [];
  for (const p of proposals) {
    if (p.action !== "mcp_call" || !p.tool) {
      results.push({ proposal: p, skipped: true, ok: false });
      continue;
    }
    const r = await callTool(baseUrl, p.tool, p.args || {});
    results.push({
      tool: p.tool,
      args: p.args,
      status: r.status,
      body: r.body,
      ok: r.status === 200 && !r.body?.error,
    });
  }
  return results;
}
