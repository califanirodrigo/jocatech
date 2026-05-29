const agentInstructions = [
  "Voce e o Agente JocaTech, um assistente para um sistema de ordem de servico.",
  "Fale de forma acolhedora, educada e humana, como um atendente tecnico prestativo.",
  "Cumprimente de forma natural quando o usuario iniciar a conversa.",
  "Responda sempre em portugues do Brasil, de forma curta, clara e util.",
  "Identifique palavras-chave como cliente, OS, ordem, total, tecnico, status, desconto, telefone, equipamento, defeito, problema, itens, resumo e campos faltantes.",
  "Antes de passar uma mensagem final com dados da OS, confira se faltam informacoes importantes e solicite esses dados ao usuario.",
  "Use apenas o contexto enviado pelo sistema para falar de clientes, ordens, valores e status.",
  "Nao invente dados. Se faltar informacao, diga exatamente o que precisa ser preenchido.",
  "Ajude o usuario a criar, revisar e entender ordens de servico."
].join(" ");

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "nao informada";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function hasAny(text, words) {
  return words.some((word) => text.includes(word));
}

function currentOrder(context) {
  return context?.order || {};
}

function currentTotals(context) {
  return context?.totals || {};
}

function missingFields(order) {
  const labels = {
    clientName: "cliente",
    clientPhone: "telefone",
    equipment: "equipamento",
    problem: "defeito relatado",
    technician: "responsavel tecnico",
    status: "status",
    orderDate: "data"
  };

  return Object.entries(labels)
    .filter(([key]) => !String(order[key] || "").trim())
    .map(([, label]) => label);
}

function missingFieldsForFinalMessage(order) {
  const labels = {
    clientName: "nome do cliente",
    clientPhone: "telefone do cliente",
    equipment: "equipamento",
    problem: "defeito relatado",
    technician: "responsavel tecnico"
  };

  return Object.entries(labels)
    .filter(([key]) => !String(order[key] || "").trim())
    .map(([, label]) => label);
}

function wantsFinalOrderMessage(text) {
  return hasAny(text, [
    "mensagem",
    "mandar",
    "enviar",
    "passar",
    "texto",
    "resumo",
    "resumir",
    "resuma",
    "dados da os",
    "ordem atual",
    "os atual",
    "whatsapp",
    "zap"
  ]);
}

function buildLocalIntentReply(message, context) {
  const text = normalizeText(message);
  const order = currentOrder(context);
  const totals = currentTotals(context);
  const items = Array.isArray(context?.items) ? context.items : [];
  const clientsCount = Number(context?.clientsCount) || 0;
  const ordersCount = Number(context?.ordersCount) || 0;

  if (hasAny(text, ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "iniciar", "começar", "comecar"])) {
    return "Olá, seja bem-vindo à JocaTech. Estou aqui para te ajudar com a ordem de serviço. Você quer consultar o total, revisar os dados da OS ou preparar uma mensagem para o cliente?";
  }

  if (hasAny(text, ["ajuda", "comandos", "o que voce faz", "o que vc faz"])) {
    return "Claro. Posso te ajudar com total da OS, dados do cliente, técnico, status, equipamento, defeito, itens, resumo da OS e campos faltantes. Se quiser, diga: 'preparar mensagem da OS'.";
  }

  if (hasAny(text, ["faltando", "falta", "pendente", "preencher", "completo", "completa"])) {
    const missing = missingFields(order);
    return missing.length
      ? `Ainda falta preencher: ${missing.join(", ")}.`
      : "A OS tem os campos principais preenchidos.";
  }

  if (hasAny(text, ["total", "valor", "preco", "preço", "subtotal", "desconto"])) {
    return [
      `Subtotal: ${formatCurrency(totals.subtotal)}.`,
      `Desconto: ${formatCurrency(totals.discount)}.`,
      `Total: ${formatCurrency(totals.grandTotal)}.`
    ].join(" ");
  }

  if (hasAny(text, ["cliente", "nome", "cpf", "cnpj", "documento", "email", "e-mail", "telefone", "contato", "endereco", "endereço"])) {
    if (!order.clientName) return "Nenhum cliente foi informado na OS atual.";
    return [
      `Cliente: ${order.clientName}.`,
      `Telefone: ${order.clientPhone || "nao informado"}.`,
      `CPF/CNPJ: ${order.clientDocument || "nao informado"}.`,
      `E-mail: ${order.clientEmail || "nao informado"}.`,
      `Endereco: ${order.clientAddress || "nao informado"}.`
    ].join(" ");
  }

  if (hasAny(text, ["tecnico", "responsavel", "caio", "rodrigo"])) {
    return `Responsavel tecnico selecionado: ${order.technician || "nao informado"}.`;
  }

  if (hasAny(text, ["status", "situacao", "situação", "andamento"])) {
    return `Status da OS: ${order.status || "nao informado"}.`;
  }

  if (hasAny(text, ["equipamento", "aparelho", "modelo", "marca", "serie", "serial"])) {
    return [
      `Equipamento: ${order.equipment || "nao informado"}.`,
      `Marca/modelo: ${order.brandModel || "nao informado"}.`,
      `Numero de serie: ${order.serialNumber || "nao informado"}.`
    ].join(" ");
  }

  if (hasAny(text, ["defeito", "problema", "diagnostico", "diagnóstico", "servico", "serviço", "observacao", "observação"])) {
    return [
      `Defeito relatado: ${order.problem || "nao informado"}.`,
      `Diagnostico/servico: ${order.diagnosis || "nao informado"}.`,
      `Observacoes: ${order.notes || "nao informado"}.`
    ].join(" ");
  }

  if (hasAny(text, ["item", "itens", "produto", "peca", "peça", "mao de obra", "mão de obra"])) {
    if (!items.length) return "Nenhum item foi adicionado na OS atual.";
    return items.map((item, index) => {
      return `${index + 1}. ${item.description || "Item sem descricao"} - qtd. ${item.qty || 0} - total ${formatCurrency(item.total)}.`;
    }).join(" ");
  }

  if (wantsFinalOrderMessage(text)) {
    const missing = missingFieldsForFinalMessage(order);
    if (missing.length) {
      return `Antes de preparar a mensagem da OS, preciso confirmar alguns dados: ${missing.join(", ")}. Preencha essas informações no cadastro ou me diga esses dados aqui.`;
    }

    return [
      `Perfeito, segue uma mensagem pronta:`,
      `Olá, ${order.clientName}. Sua ordem de serviço ${order.orderNumber || ""} está com status "${order.status || "nao informado"}".`,
      `Equipamento: ${order.equipment || "nao informado"}. Defeito relatado: ${order.problem || "nao informado"}.`,
      `Responsável técnico: ${order.technician || "nao informado"}. Total: ${formatCurrency(totals.grandTotal)}.`
    ].join(" ");
  }

  if (hasAny(text, ["quantos", "quantidade", "cadastrados", "salvos", "salvas", "banco"])) {
    return `Ha ${clientsCount} cliente(s) cadastrado(s) e ${ordersCount} ordem(ns) salva(s).`;
  }

  return null;
}

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

    const localReply = buildLocalIntentReply(message, context);
    if (localReply) {
      send(200, { reply: localReply, source: "local-intent" });
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
