import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from "@modelcontextprotocol/sdk/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const transports = new Map();

const mcpServer = new Server(
  { name: "workflowy-cloud-mcp", version: "1.0.0" }, 
  { capabilities: { tools: {} } }
);

// Define tool schema definitions for Gemini
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_nodes",
      description: "Retrieves all nodes and the entire document structure from WorkFlowy",
      inputSchema: { type: "object", properties: {} }
    },
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
      name: "update_bullet",
      description: "Modifies or updates the text of an existing bullet point in WorkFlowy",
      inputSchema: {
        type: "object",
        properties: { 
          nodeId: { type: "string", description: "The WorkFlowy node/item ID to modify" },
          text: { type: "string", description: "The new content text for the bullet" }
        },
        required: ["nodeId", "text"]
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

// Handle WorkFlowy API requests
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const apiKey = process.env.WORKFLOWY_TOKEN;
  if (!apiKey) {
    throw new Error("WORKFLOWY_TOKEN environment variable is missing on Render.");
  }

  // View entire document structure
  if (request.params.name === "get_nodes") {
    const response = await fetch("https://workflowy.com/api/v1/nodes", {
      method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`WorkFlowy API error: ${JSON.stringify(data)}`);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  }

  // Create new bullet
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

  // Modify/Update existing bullet
  if (request.params.name === "update_bullet") {
    const { nodeId, text } = request.params.arguments;
    const response = await fetch(`https://workflowy.com/api/v1/nodes/${nodeId}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: text })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(`WorkFlowy API error: ${JSON.stringify(data)}`);
    }
    return { content: [{ type: "text", text: `Updated bullet ID "${nodeId}" to "${text}"` }] };
  }

  // Delete bullet
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
    return { content: [{ type: "text", text: `Deleted WorkFlowy bullet ID: "${nodeId}"` }] };
  }

  throw new Error("Tool not found");
});

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Cloud MCP Server listening on port ${PORT}`);
});