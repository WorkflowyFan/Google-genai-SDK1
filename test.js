import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// REPLACE THIS with your actual Render app URL
const RENDER_SSE_URL = "https://google-genai-sdk1.onrender.com/sse";

async function runTest() {
  console.log("1. Connecting to Render Cloud MCP server...");
  const transport = new SSEClientTransport(new URL(RENDER_SSE_URL));
  const client = new Client({ name: "test-client", version: "1.0.0" });

  await client.connect(transport);
  console.log("2. Connected successfully!");

  console.log("3. Calling 'add_bullet' tool...");
  const result = await client.callTool({
    name: "add_bullet",
    arguments: {
      text: "Test bullet created from Cloud MCP!",
      parentId: "None"
    }
  });

  console.log("4. Response from server:");
  console.log(result);
}

runTest().catch((err) => {
  console.error("Test failed:", err.message);
});