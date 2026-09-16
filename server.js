import express from 'express';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from "@modelcontextprotocol/sdk/types.js";

const app = express();
app.use(express.json());

// 1. Initialize the Cloud MCP Server
const mcpServer = new Server(
  { name: "workflowy-cloud-mcp", version: "1.0.0" }, 
  { capabilities: { tools: {} } }
);

// 2. Define WorkFlowy tools for Gemini / Voice Clients
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "add_bullet",
    description: "Creates a new bullet point in WorkFlowy",
    inputSchema: {
      type: "object",
      properties: { 
        text: { type: "string", description: "The content text for the bullet" }, 
        parentId: { type: "string", description: "Optional WorkFlowy parent node ID" } 
      },
      required: ["text"]
    }
  }]
}));

// 3. Define execution logic to call WorkFlowy API
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "add_bullet") {
    const { text, parentId } = request.params.arguments;
    const apiKey = process.env.WORKFLOWY_TOKEN;

    if (!apiKey) {
      throw new Error("WORKFLOWY_TOKEN environment variable is missing on Render.");
    }

    // Live HTTP request to official WorkFlowy API
    const response = await fetch("https://workflowy.com/api/v1/nodes", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        parent_id: parentId || "None",
        name: text
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`WorkFlowy API error: ${JSON.stringify(data)}`);
    }

    return { 
      content: [{ 
        type: "text", 
        text: `Successfully created WorkFlowy bullet: "${text}"` 
      }] 
    };
  }
  throw new Error("Tool not found");
});

// 4. Setup Server-Sent Events (SSE) endpoints
let transport;
app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/message", res);
  await mcpServer.connect(transport);
});

app.post("/message", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  }
});

// 5. Start the Express Web Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Cloud MCP Server streaming on Render! Listening on port ${PORT}`);
});