import process from "process";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

function normalizeBearerToken(token) {
  if (!token) return "";
  return String(token).trim().replace(/^Bearer\s+/i, "");
}

const AXIS_API_BASE_URL = String(process.env.AXIS_API_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const AXIS_API_TOKEN = normalizeBearerToken(process.env.AXIS_API_TOKEN);

function axisAuthHeaders() {
  if (!AXIS_API_TOKEN) return {};
  return { Authorization: `Bearer ${AXIS_API_TOKEN}` };
}

async function axisFetchJson(path, options = {}) {
  const url = `${AXIS_API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...axisAuthHeaders(),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = json?.error || `Axis API error (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

const tools = [
  {
    name: "axis_list_tasks",
    description: "List tasks from Axis (requires AXIS_API_TOKEN).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "axis_create_task",
    description: "Create a new task in Axis (requires AXIS_API_TOKEN).",
    inputSchema: {
      type: "object",
      required: ["task_name"],
      properties: {
        task_name: { type: "string" },
        task_priority: { type: "string" },
        task_category: { type: "string" },
        task_deadline: { type: "string" },
        task_deadline_time: { type: "string" },
        task_duration_hours: { type: "number" },
        computer_required: { type: "boolean" },
      },
    },
  },
  {
    name: "axis_update_task",
    description: "Update an existing task by id (requires AXIS_API_TOKEN).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        task_name: { type: "string" },
        task_priority: { type: "string" },
        task_category: { type: "string" },
        task_deadline: { type: "string" },
        task_deadline_time: { type: "string" },
        task_duration_hours: { type: "number" },
        computer_required: { type: "boolean" },
        completed: { type: "boolean" },
      },
    },
  },
  {
    name: "axis_delete_task",
    description: "Delete a task by id (requires AXIS_API_TOKEN).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "axis_list_habits",
    description: "List daily habits from Axis (requires AXIS_API_TOKEN).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "axis_add_habit",
    description: "Add a daily habit to Axis (requires AXIS_API_TOKEN).",
    inputSchema: {
      type: "object",
      required: ["name", "time"],
      properties: {
        name: { type: "string" },
        time: { type: "string" },
        description: { type: "string" },
      },
    },
  },
  {
    name: "axis_delete_habit",
    description: "Delete a daily habit by id (requires AXIS_API_TOKEN).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "axis_get_calendar_links",
    description: "Get calendar subscription links for Axis (requires AXIS_API_TOKEN).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

async function handleToolCall(name, args) {
  if (!AXIS_API_TOKEN) {
    throw new Error("AXIS_API_TOKEN is not set. Set it to a valid JWT from Axis /api/auth/login.");
  }

  if (name === "axis_list_tasks") {
    return axisFetchJson("/api/tasks", { method: "GET" });
  }

  if (name === "axis_create_task") {
    return axisFetchJson("/api/tasks", { method: "POST", body: JSON.stringify(args || {}) });
  }

  if (name === "axis_update_task") {
    const id = String(args?.id || "").trim();
    if (!id) throw new Error("Missing id");
    const { id: _id, ...patch } = args || {};
    return axisFetchJson(`/api/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  if (name === "axis_delete_task") {
    const id = String(args?.id || "").trim();
    if (!id) throw new Error("Missing id");
    return axisFetchJson(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  if (name === "axis_list_habits") {
    return axisFetchJson("/api/habits", { method: "GET" });
  }

  if (name === "axis_add_habit") {
    return axisFetchJson("/api/habits", { method: "POST", body: JSON.stringify(args || {}) });
  }

  if (name === "axis_delete_habit") {
    const id = String(args?.id || "").trim();
    if (!id) throw new Error("Missing id");
    return axisFetchJson(`/api/habits/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  if (name === "axis_get_calendar_links") {
    return axisFetchJson("/api/calendar/token", { method: "GET" });
  }

  throw new Error(`Unknown tool: ${name}`);
}

const server = new Server(
  { name: "axis-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params?.name;
  const args = request.params?.arguments || {};
  try {
    const result = await handleToolCall(name, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${err?.message || String(err)}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
