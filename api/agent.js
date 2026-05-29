module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    response.status(500).json({ error: "OPENAI_API_KEY não configurada no Vercel." });
    return;
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
    const message = String(body.message || "").trim();
    const context = body.context || {};

    if (!message) {
      response.status(400).json({ error: "Mensagem vazia." });
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
      response.status(openaiResponse.status).json({
        error: data.error?.message || "Erro ao consultar o agente."
      });
      return;
    }

    response.status(200).json({
      reply: data.output_text || "Não consegui gerar uma resposta agora."
    });
  } catch (error) {
    response.status(500).json({ error: error.message || "Erro interno do agente." });
  }
};
