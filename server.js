import express from 'express';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/express.js";

const app = express();
app.use(express.json());

// 1. Initialize the MCP Server
const mcpServer = new Server(
  { name: "workflowy-cloud-mcp", version: "1.0.0" }, 
  { capabilities: { tools: {} } }
);

// 2. Define your WorkFlowy tools for the AI to discover
mcpServer.setRequestHandler("tools/list", async () => ({
  tools: [{
    name: "add_bullet",
    description: "Creates a new bullet in WorkFlowy",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" }, parentId: { type: "string" } },
      required: ["text", "parentId"]
    }
  }]
}));

// 3. Define what happens when Gemini actually calls the tool
mcpServer.setRequestHandler("tools/call", async (request) => {
  if (request.params.name === "add_bullet") {
     const { text, parentId } = request.params.arguments;
     
     // Make the actual WorkFlowy API call here using your hidden API key
     // const wfResponse = await fetch("https://workflowy.com/api/v1/nodes"...
     
     return { content: [{ type: "text", text: "Bullet successfully added to WorkFlowy!" }] };
  }
});

// 4. Expose the MCP Server over HTTP (Server-Sent Events)
let transport;
app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/message", res);
  await mcpServer.connect(transport);
});

app.post("/message", async (req, res) => {
  if (transport) await transport.handlePostMessage(req, res);
});

app.listen(3000, () => console.log("Cloud MCP Server streaming on Render!"));