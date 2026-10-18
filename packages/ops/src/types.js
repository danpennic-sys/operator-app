/**
 * @op/ops public shapes (JSDoc — not runtime validation).
 * Validate MCP I/O at OpsController boundary.
 *
 * @typedef {'ok'|'degraded'|'offline'|'unknown'} ModuleHealth
 *
 * @typedef {Object} ScheduleSummary
 * @property {string} id
 * @property {string} agent_id
 * @property {string} kind
 * @property {string} expression
 * @property {boolean} enabled
 * @property {string|null} [group_name]
 *
 * @typedef {Object} McpProposal
 * @property {'mcp_call'|'pending_engine'|'skip'} action
 * @property {string} [tool]
 * @property {Record<string, unknown>} [args]
 * @property {boolean} requires_confirm
 * @property {string} reason
 *
 * @typedef {Object} OpsViewModel
 * @property {ModuleHealth} health
 * @property {string|null} mcp_url
 * @property {ScheduleSummary[]} schedules
 * @property {McpProposal[]} proposals
 * @property {true} confirmRequired
 * @property {boolean} confirmed
 * @property {string|null} last_error
 * @property {string[]} allowlist
 */

export {};
