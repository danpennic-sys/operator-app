# Operator App — OPS-first slice

```text
operator-app/
  apps/shell/ops_tab.js
  packages/ops/
    src/types.js
    src/ops_controller.js
    src/mcp_client.js
    src/confirm.js
    src/allowlist.js
    test/
    CHANGELOG.md
    RELEASE.md
    package.json
```

## Frozen

- `@op/ops` owns typedefs + runtime
- Shell imports public API only
- MCP only behind `OpsController`
- Sequence: propose → confirm → apply
- No shared DB, PNT, or Evidence in this tree
- Extract `@op/shell-api` only when a second consumer exists

## Test

```bash
cd packages/ops && node --test test/*.test.js
```

`FORCE_MCP_URL=http://127.0.0.1:8787` for live control plane.
