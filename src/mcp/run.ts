import { runStdio } from './server';

runStdio().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
