import { Client } from '@modelcontextprotocol/sdk/client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Client as McpClient } from '@modelcontextprotocol/sdk/client';
import { createTerraPilotServer } from './server';

let clientPromise: Promise<McpClient> | null = null;

export function getMcpClient(): Promise<McpClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client(
        { name: 'terrapilot-agent', version: '1.0.0' },
        { capabilities: {} },
      );
      const server = createTerraPilotServer();
      await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
      return client;
    })();
  }
  return clientPromise;
}

export type OpenAiTool = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export async function getOpenAiTools(): Promise<OpenAiTool[]> {
  const client = await getMcpClient();
  const { tools } = await client.listTools();
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description ?? '',
      parameters: (tool.inputSchema as Record<string, unknown>) ?? {
        type: 'object',
        properties: {},
      },
    },
  }));
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const client = await getMcpClient();
  const result = await client.callTool({ name, arguments: args });
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
  return content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n');
}
