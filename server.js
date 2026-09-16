import express from 'express';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const app = express();
app.use(express.json());

// 1. Initialize the Cloud MCP Server
const mcpServer = new Server(
  { name: "workflowy-cloud-mcp", version: "1.0.0" }, 
  { capabilities: { tools: {} } }
);

// 2. Define WorkFlowy tools for Gemini / OpenAI discovery
mcpServer.setRequestHandler("tools/list", async () => ({
  tools: [{
    name: "add_bullet",
    description: "Creates a new bullet point in WorkFlowy",
    inputSchema: {
      type: "object",
      properties: { 
        text: { type: "string", description: "The content of the bullet" }, 
        parentId: { type: "string", description: "The ID of the parent node" } 
      },
      required: ["text", "parentId"]
    }
  }]
}));

// 3. Define execution logic when a tool is invoked
mcpServer.setRequestHandler("tools/call", async (request) => {
  if (request.params.name === "add_bullet") {
    const { text, parentId } = request.params.arguments;
    
    // Future step: Add your WorkFlowy API call here using process.env.WORKFLOWY_TOKEN
    
    return { 
      content: [{ type: "text", text: `Bullet "${text}" queued for parent ${parentId}!` }] 
    };
  }
  throw new Error("Tool not found");
});

// 4. Setup Server-Sent Events (SSE) endpoints for WebRTC / Audio Frontends
let transport;
app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/message", res);
  await mcpServer.connect(transport);
});

app.post("/message", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  }
});

// 5. Start the Express Web Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Cloud MCP Server streaming on Render! Listening on port ${PORT}`);
});