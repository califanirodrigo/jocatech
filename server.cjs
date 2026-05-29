const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, "database.json");

function defaultDatabase() {
  return {
    clients: [],
    orders: []
  };
}

function readDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      writeDatabase(defaultDatabase());
    }

    return {
      ...defaultDatabase(),
      ...JSON.parse(fs.readFileSync(DB_FILE, "utf8"))
    };
  } catch {
    return defaultDatabase();
  }
}

function writeDatabase(database) {
  fs.writeFileSync(DB_FILE, JSON.stringify(database, null, 2), "utf8");
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        request.destroy();
        reject(new Error("Request too large"));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

async function callAgent(message, context) {
  if (!process.env.OPENAI_API_KEY) {
    return { status: 500, data: { error: "OPENAI_API_KEY não configurada." } };
  }

  const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      instructions: [
        "Você é o Agente JocaTech, um assistente para um sistema de ordem de serviço.",
        "Responda sempre em português do Brasil, de forma curta, clara e útil.",
        "Use apenas o contexto enviado pelo sistema para falar de clientes, ordens, valores e status.",
        "Não invente dados. Se faltar informação, diga exatamente o que precisa ser preenchido.",
        "Ajude o usuário a criar, revisar e entender ordens de serviço."
      ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Contexto atual do sistema:\n${JSON.stringify(context || {}, null, 2)}\n\nMensagem do usuário:\n${message}`
            }
          ]
        }
      ]
    })
  });

  const data = await openaiResponse.json();
  if (!openaiResponse.ok) {
    return { status: openaiResponse.status, data: { error: data.error?.message || "Erro ao consultar o agente." } };
  }

  return { status: 200, data: { reply: data.output_text || "Não consegui gerar uma resposta agora." } };
}

function sendFile(response, requestUrl) {
  const pathname = requestUrl === "/" ? "/index.html" : decodeURIComponent(requestUrl.split("?")[0]);
  const filePath = path.normalize(path.join(ROOT, pathname));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml"
    };

    response.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream"
    });
    response.end(data);
  });
}

async function handleApi(request, response) {
  const database = readDatabase();
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/agent") {
    const body = JSON.parse(await readRequestBody(request) || "{}");
    const result = await callAgent(String(body.message || "").trim(), body.context || {});
    sendJson(response, result.status, result.data);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/clients") {
    sendJson(response, 200, database.clients || []);
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/clients") {
    database.clients = JSON.parse(await readRequestBody(request) || "[]");
    writeDatabase(database);
    sendJson(response, 200, database.clients);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/orders") {
    sendJson(response, 200, database.orders || []);
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/orders") {
    database.orders = JSON.parse(await readRequestBody(request) || "[]");
    writeDatabase(database);
    sendJson(response, 200, database.orders);
    return;
  }

  sendJson(response, 404, { error: "Endpoint not found" });
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.url.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }

    sendFile(response, request.url);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${PORT}`);

  console.log(`JocaTech OS rodando em http://localhost:${PORT}`);
  addresses.forEach((address) => console.log(`Rede local: ${address}`));
});
