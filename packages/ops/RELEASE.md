# @op/ops — release boundary

**Version:** 0.1.0  
**Contract:** Operator Pages MCP (`TOOL_SURFACE.md` / `local_control.py`)

## Safety gates

1. `confirmRequired: true` always  
2. `apply()` no-ops unless `confirmed === true`  
3. Empty allowlist blocks write tools  
4. MCP down → `health: offline`  
5. One-shot confirm (cleared after apply)  
6. Apply errors retained after schedule refresh  

## Test

```bash
cd packages/ops && npm test
```
