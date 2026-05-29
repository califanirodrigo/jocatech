module.exports = async function handler(request, response) {
  function send(statusCode, data) {
    response.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(JSON.stringify(data));
  }

  async function readBody() {
    if (request.body) {
      return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    }

    return await new Promise((resolve, reject) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => resolve(body ? JSON.parse(body) : {}));
      request.on("error", reject);
    });
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    send(405, { error: "Method not allowed" });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    send(500, { error: "OPENAI_API_KEY não configurada no Vercel." });
    return;
  }

  try {
    const body = await readBody();
    const message = String(body.message || "").trim();
    const context = body.context || {};

    if (!message) {
      send(400, { error: "Mensagem vazia." });
      return;
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
                text: `Contexto atual do sistema:\n${JSON.stringify(context, null, 2)}\n\nMensagem do usuário:\n${message}`
              }
            ]
          }
        ]
      })
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      send(openaiResponse.status, {
        error: data.error?.message || "Erro ao consultar o agente."
      });
      return;
    }

    send(200, {
      reply: data.output_text || "Não consegui gerar uma resposta agora."
    });
  } catch (error) {
    send(500, { error: error.message || "Erro interno do agente." });
  }
};
