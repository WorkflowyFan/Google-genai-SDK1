import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from "@modelcontextprotocol/sdk/types.js";

// Explicit directory path setup for Node ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve static files and explicitly route root to index.html
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Map to store active SSE transports by sessionId
const transports = new Map();

// 1. Initialize the Cloud MCP Server
const mcpServer = new Server(
  { name: "workflowy-cloud-mcp", version: "1.0.0" }, 
  { capabilities: { tools: {} } }
);

// Add delete_bullet to ListToolsRequestSchema
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
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
    },
    {
      name: "delete_bullet",
      description: "Deletes an existing bullet point in WorkFlowy using its item ID",
      inputSchema: {
        type: "object",
        properties: { 
          nodeId: { type: "string", description: "The WorkFlowy node/item ID to delete" } 
        },
        required: ["nodeId"]
      }
    }
  ]
}));

// Add delete_bullet execution logic to CallToolRequestSchema
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const apiKey = process.env.WORKFLOWY_TOKEN;
  if (!apiKey) {
    throw new Error("WORKFLOWY_TOKEN environment variable is missing on Render.");
  }

  if (request.params.name === "add_bullet") {
    const { text, parentId } = request.params.arguments;
    const response = await fetch("https://workflowy.com/api/v1/nodes", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ parent_id: parentId || "None", name: text })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`WorkFlowy API error: ${JSON.stringify(data)}`);
    return { content: [{ type: "text", text: `Created WorkFlowy bullet: "${text}" (ID: ${data.item_id})` }] };
  }

  if (request.params.name === "delete_bullet") {
    const { nodeId } = request.params.arguments;
    const response = await fetch(`https://workflowy.com/api/v1/nodes/${nodeId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(`WorkFlowy API error: ${JSON.stringify(data)}`);
    }
    return { content: [{ type: "text", text: `Successfully deleted WorkFlowy bullet ID: "${nodeId}"` }] };
  }

  throw new Error("Tool not found");
});

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

// 4. Setup Server-Sent Events (SSE) endpoints with Session Map
app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/message", res);
  transports.set(transport.sessionId, transport);

  req.on("close", () => {
    transports.delete(transport.sessionId);
  });

  await mcpServer.connect(transport);
});

app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(400).send("Session not found");
    return;
  }

  await transport.handlePostMessage(req, res);
});

// 5. Start the Express Web Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Cloud MCP Server streaming on Render! Listening on port ${PORT}`);
});