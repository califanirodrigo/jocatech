const agentInstructions = [
  "Voce e o Agente JocaTech, um assistente para um sistema de ordem de servico.",
  "Responda sempre em portugues do Brasil, de forma curta, clara e util.",
  "Use apenas o contexto enviado pelo sistema para falar de clientes, ordens, valores e status.",
  "Nao invente dados. Se faltar informacao, diga exatamente o que precisa ser preenchido.",
  "Ajude o usuario a criar, revisar e entender ordens de servico."
].join(" ");

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

  async function askGemini(message, context) {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: agentInstructions }]
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Contexto atual do sistema:\n${JSON.stringify(context, null, 2)}\n\nMensagem do usuario:\n${message}`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await geminiResponse.json();
    if (!geminiResponse.ok) {
      return {
        status: geminiResponse.status,
        data: { error: data.error?.message || "Erro ao consultar o Gemini." }
      };
    }

    return {
      status: 200,
      data: {
        reply: data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim()
          || "Nao consegui gerar uma resposta agora."
      }
    };
  }

  async function askOpenAI(message, context) {
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.2",
        instructions: agentInstructions,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Contexto atual do sistema:\n${JSON.stringify(context, null, 2)}\n\nMensagem do usuario:\n${message}`
              }
            ]
          }
        ]
      })
    });

    const data = await openaiResponse.json();
    if (!openaiResponse.ok) {
      return {
        status: openaiResponse.status,
        data: { error: data.error?.message || "Erro ao consultar o agente." }
      };
    }

    return {
      status: 200,
      data: { reply: data.output_text || "Nao consegui gerar uma resposta agora." }
    };
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    send(405, { error: "Method not allowed" });
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

    if (process.env.GEMINI_API_KEY) {
      const result = await askGemini(message, context);
      send(result.status, result.data);
      return;
    }

    if (process.env.OPENAI_API_KEY) {
      const result = await askOpenAI(message, context);
      send(result.status, result.data);
      return;
    }

    send(500, { error: "Configure GEMINI_API_KEY ou OPENAI_API_KEY no Vercel." });
  } catch (error) {
    send(500, { error: error.message || "Erro interno do agente." });
  }
};
