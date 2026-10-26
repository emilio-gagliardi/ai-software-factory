import { providerPluginDescriptorSchema } from '@archon/provider-contract/plugin';

/**
 * Descriptor sent to Archon during `initialize`. Every capability flag states what this
 * build actually does today. Flags flip to true only when the matching behaviour is wired.
 *
 * Credentials: Archon delivers no key to this provider (`specs: []`). Turns run in panes
 * under the operator's own Claude Code / Pi login, so `checkCredential` reports `native`.
 */
export const descriptor = providerPluginDescriptorSchema.parse({
  protocol: 1,
  id: 'herdr',
  displayName: 'Herdr (Claude Code / Pi in visible panes)',
  version: '0.1.0',
  capabilities: {
    backgroundWork: 'none',
    sessionResume: false,
    sessionFork: false,
    mcp: false,
    hooks: false,
    skills: true,
    plugins: false,
    agents: false,
    toolRestrictions: false,
    structuredOutput: false,
    requiresAllPropertiesRequired: false,
    envInjection: false,
    costControl: false,
    costReporting: false,
    tokenReporting: false,
    stopReasonReporting: false,
    turnCountReporting: false,
    resolvedModelReporting: false,
    effortControl: false,
    fallbackModel: false,
    sandbox: false,
    settingSources: false,
    nativeTools: false,
    containerExec: false,
  },
  credentials: { kind: 'static', specs: [] },
  configSchema: {
    type: 'object',
    properties: { model: { type: 'string', minLength: 1 } },
    additionalProperties: false,
  },
});
