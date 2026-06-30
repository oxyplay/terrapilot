import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { toolSchemas, toolHandlers } from './tools';

export const SERVER_NAME = 'terrapilot';
export const SERVER_VERSION = '1.0.0';

function asText(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function createTerraPilotServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    'parseTerraform',
    { description: toolSchemas.parseTerraform.description, inputSchema: toolSchemas.parseTerraform.input },
    async (args) => asText(await toolHandlers.parseTerraform(args)),
  );
  server.registerTool(
    'getInstancePricing',
    { description: toolSchemas.getInstancePricing.description, inputSchema: toolSchemas.getInstancePricing.input },
    async (args) => asText(await toolHandlers.getInstancePricing(args)),
  );
  server.registerTool(
    'recommendInstance',
    { description: toolSchemas.recommendInstance.description, inputSchema: toolSchemas.recommendInstance.input },
    async (args) => asText(await toolHandlers.recommendInstance(args)),
  );
  server.registerTool(
    'checkSecurityRules',
    { description: toolSchemas.checkSecurityRules.description, inputSchema: toolSchemas.checkSecurityRules.input },
    async (args) => asText(await toolHandlers.checkSecurityRules(args)),
  );
  server.registerTool(
    'estimateMonthlyCost',
    { description: toolSchemas.estimateMonthlyCost.description, inputSchema: toolSchemas.estimateMonthlyCost.input },
    async (args) => asText(await toolHandlers.estimateMonthlyCost(args)),
  );

  return server;
}

export async function runStdio() {
  const server = createTerraPilotServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('TerraPilot MCP Server running on stdio');
}
