import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {name as packageName, version} from './meta.js';
import {TOOL_SPECS, toolContext} from './tools.js';

export async function startStdio(log = (line: string) => process.stderr.write(`${line}\n`)) {
  const server = new McpServer({name: packageName, version});

  for (const tool of TOOL_SPECS) {
    server.registerTool(tool.name, {
      description: `[${tool.group}] ${tool.description}`,
      inputSchema: tool.schema,
      annotations: {readOnlyHint: tool.group === 'project' && ['inspect_project', 'validate_project'].includes(tool.name)},
    }, async parsed => ok(await tool.run(parsed as Record<string, any>)));
  }

  log(`aiediting mcp: ${TOOL_SPECS.length} tools ready (stdio)`);
  await server.connect(new StdioServerTransport());
  return server;
}

function ok(value: unknown) {
  return {content: [{type: 'text' as const, text: JSON.stringify(value, null, 2)}]};
}

export {toolContext};
