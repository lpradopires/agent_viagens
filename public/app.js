/* ==========================================================================
   Agente de Viagens IA - Client-side Interactive Application (app.js)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  // --- Elementos do DOM ---
  const statusText = document.getElementById("statusText");
  const providerText = document.getElementById("providerText");
  const modelText = document.getElementById("modelText");
  const threadIdDisplay = document.getElementById("threadIdDisplay");

  const filterOrigin = document.getElementById("filterOrigin");
  const filterDestination = document.getElementById("filterDestination");
  const filterDepartureDate = document.getElementById("filterDepartureDate");
  const filterReturnDate = document.getElementById("filterReturnDate");
  const chkFlights = document.getElementById("chkFlights");
  const chkHotels = document.getElementById("chkHotels");
  const filterPassengers = document.getElementById("filterPassengers");

  const promptInput = document.getElementById("promptInput");
  const btnSendMessage = document.getElementById("btnSendMessage");
  const btnResetPrompt = document.getElementById("btnResetPrompt");
  const btnClearChat = document.getElementById("btnClearChat");
  const btnNewSession = document.getElementById("btnNewSession");

  const chatFeed = document.getElementById("chatFeed");
  const typingIndicator = document.getElementById("typingIndicator");
  const promptSyncBadge = document.getElementById("promptSyncBadge");
  const toastContainer = document.getElementById("toastContainer");

  // --- Estado da Aplicação ---
  let currentThreadId = getOrCreateThreadId();
  let isUserCustomPrompt = false;
  let isProcessing = false;

  // Initial setup: definir datas padrão (daqui a 30 e 37 dias)
  initDefaultDates();
  threadIdDisplay.textContent = currentThreadId;

  // Carregar configurações do backend
  fetchConfig();

  // Gerar prompt inicial a partir dos filtros
  updatePromptFromFilters();

  // --- Event Listeners dos Filtros ---
  const filterInputs = [
    filterOrigin,
    filterDestination,
    filterDepartureDate,
    filterReturnDate,
    chkFlights,
    chkHotels,
    filterPassengers,
  ];

  filterInputs.forEach((input) => {
    input.addEventListener("input", () => {
      if (!isUserCustomPrompt) {
        updatePromptFromFilters();
      }
    });
    input.addEventListener("change", () => {
      if (!isUserCustomPrompt) {
        updatePromptFromFilters();
      }
    });
  });

  // Listener no textarea para identificar quando o usuário customiza manualmente
  promptInput.addEventListener("input", () => {
    isUserCustomPrompt = true;
    updateSyncBadge();
  });

  // Teclas de atalho no textarea (Enter para enviar, Shift+Enter para nova linha)
  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Botões de Ação
  btnSendMessage.addEventListener("click", sendMessage);
  btnResetPrompt.addEventListener("click", () => {
    isUserCustomPrompt = false;
    updatePromptFromFilters();
    showToast("Prompt restaurado com base nos filtros!");
  });
  btnClearChat.addEventListener("click", clearChatFeed);
  btnNewSession.addEventListener("click", startNewSession);

  // Chips de Presets Rápidos
  document.querySelectorAll(".chip-btn").forEach((chip) => {
    chip.addEventListener("click", () => {
      const origin = chip.dataset.origin;
      const dest = chip.dataset.dest;
      if (origin) filterOrigin.value = origin;
      if (dest) filterDestination.value = dest;
      isUserCustomPrompt = false;
      updatePromptFromFilters();
      showToast(`Filtros atualizados para: ${origin} ➔ ${dest}`);
    });
  });

  // --- Funções Principais ---

  function getOrCreateThreadId() {
    let saved = localStorage.getItem("travel_agent_thread_id");
    if (!saved) {
      saved = `web_session_${Math.floor(Math.random() * 1000000)}`;
      localStorage.setItem("travel_agent_thread_id", saved);
    }
    return saved;
  }

  function startNewSession() {
    currentThreadId = `web_session_${Math.floor(Math.random() * 1000000)}`;
    localStorage.setItem("travel_agent_thread_id", currentThreadId);
    threadIdDisplay.textContent = currentThreadId;
    clearChatFeed();
    showToast("Nova sessão iniciada com histórico limpo!");
  }

  function initDefaultDates() {
    const today = new Date();

    const depDate = new Date(today);
    depDate.setDate(depDate.getDate() + 30);

    const retDate = new Date(today);
    retDate.setDate(retDate.getDate() + 37);

    filterDepartureDate.value = formatDateInput(depDate);
    filterReturnDate.value = formatDateInput(retDate);
    filterDepartureDate.min = formatDateInput(today);
    filterReturnDate.min = formatDateInput(today);
  }

  function formatDateInput(d) {
    return d.toISOString().split("T")[0];
  }

  function formatDateDisplay(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }

  function updatePromptFromFilters() {
    const origin = filterOrigin.value.trim() || "São Paulo";
    const destination = filterDestination.value.trim() || "Rio de Janeiro";
    const depDateStr = formatDateDisplay(filterDepartureDate.value);
    const retDateStr = formatDateDisplay(filterReturnDate.value);
    const wantFlights = chkFlights.checked;
    const wantHotels = chkHotels.checked;
    const passengers = filterPassengers.value;

    let generated = "";

    if (wantFlights && wantHotels) {
      generated = `Quero pesquisar passagens aéreas e acomodações de ${origin} para ${destination}. Data de partida: ${depDateStr}, retorno: ${retDateStr}. Hóspedes/Passageiros: ${passengers}.`;
    } else if (wantFlights && !wantHotels) {
      generated = `Quero pesquisar apenas passagens aéreas partindo de ${origin} para ${destination} no dia ${depDateStr}. Passageiros: ${passengers}.`;
    } else if (!wantFlights && wantHotels) {
      generated = `Quero pesquisar opções de hotéis e hospedagens em ${destination} para check-in em ${depDateStr} e check-out em ${retDateStr}. Hóspedes: ${passengers}.`;
    } else {
      generated = `Quero planejar uma viagem de ${origin} para ${destination} para a data de ${depDateStr}.`;
    }

    promptInput.value = generated;
    updateSyncBadge();
  }

  function updateSyncBadge() {
    if (isUserCustomPrompt) {
      promptSyncBadge.classList.remove("active");
      promptSyncBadge.innerHTML = '<i class="fa-solid fa-pen"></i> Prompt Personalizado';
    } else {
      promptSyncBadge.classList.add("active");
      promptSyncBadge.innerHTML = '<i class="fa-solid fa-link"></i> Sincronizado com os Filtros';
    }
  }

  async function fetchConfig() {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error("Erro ao buscar configurações");
      const data = await res.json();

      providerText.textContent = data.provider === "duffel" ? "Duffel API" : "GeckoAPI";
      modelText.textContent = data.activeModel || "Gemini 2.5 Flash";
      statusText.textContent = "Agente Pronto";
    } catch (err) {
      console.warn("Servidor de config indisponível:", err);
      statusText.textContent = "Servidor Local";
    }
  }

  function clearChatFeed() {
    chatFeed.innerHTML = `
      <div class="chat-message agent-message">
        <div class="avatar agent-avatar">
          <i class="fa-solid fa-robot"></i>
        </div>
        <div class="message-body">
          <div class="message-header">
            <span class="sender-name">Agente de Viagens IA</span>
            <span class="message-time">Agora</span>
          </div>
          <div class="message-text">
            <p>Histórico limpo. Como posso ajudar no planejamento da sua viagem?</p>
          </div>
        </div>
      </div>
    `;
  }

  // --- Envio de Mensagem para o Agente ---
  async function sendMessage() {
    const text = promptInput.value.trim();
    if (!text || isProcessing) return;

    // 1. Exibir mensagem do usuário no chat
    appendMessage("user", text);

    // 2. Limpar a caixa de texto e resetar estados para permitir novas interações
    promptInput.value = "";
    isUserCustomPrompt = true; // Mantém limpo até o usuário alterar filtros ou clicar em Restaurar
    updateSyncBadge();

    // 3. Mostrar indicador de carregamento e desabilitar botão
    isProcessing = true;
    btnSendMessage.disabled = true;
    typingIndicator.classList.remove("hidden");
    scrollChatToBottom();

    try {
      // 3. Chamar API REST do Backend Express
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          thread_id: currentThreadId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro no processamento do agente.");
      }

      // 4. Adicionar resposta do agente no chat
      appendMessage("agent", data.reply, data.flightResults, data.hotelResults);
    } catch (error) {
      appendMessage(
        "agent",
        `⚠️ **Erro de Comunicação**: ${error.message}\n\nPor favor, verifique se suas chaves de API estão ativas ou tente refazer o pedido com datas futuras validas.`
      );
      showToast(error.message, "error");
    } finally {
      isProcessing = false;
      btnSendMessage.disabled = false;
      typingIndicator.classList.add("hidden");
      scrollChatToBottom();
    }
  }

  function appendMessage(sender, text, flightResults = [], hotelResults = []) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `chat-message ${sender}-message`;

    const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    let avatarHtml = "";
    let senderTitle = "";

    if (sender === "agent") {
      avatarHtml = '<div class="avatar agent-avatar"><i class="fa-solid fa-robot"></i></div>';
      senderTitle = "Agente de Viagens IA";
    } else {
      avatarHtml = '<div class="avatar user-avatar"><i class="fa-solid fa-user"></i></div>';
      senderTitle = "Você";
    }

    // Renderizar Markdown se disponível (Marked.js)
    let formattedText = text;
    if (typeof marked !== "undefined") {
      formattedText = marked.parse(text);
    } else {
      formattedText = `<p>${escapeHtml(text)}</p>`;
    }

    // Gerar cards estruturados se houver dados brutos no estado do grafo
    let cardsHtml = "";
    if (flightResults && flightResults.length > 0) {
      cardsHtml += renderFlightCards(flightResults);
    }
    if (hotelResults && hotelResults.length > 0) {
      cardsHtml += renderHotelCards(hotelResults);
    }

    messageDiv.innerHTML = `
      ${avatarHtml}
      <div class="message-body">
        <div class="message-header">
          <span class="sender-name">${senderTitle}</span>
          <span class="message-time">${nowStr}</span>
        </div>
        <div class="message-text">
          ${formattedText}
          ${cardsHtml}
        </div>
      </div>
    `;

    chatFeed.appendChild(messageDiv);
    scrollChatToBottom();
  }

  function renderFlightCards(flights) {
    let html =
      '<div class="cards-container"><strong><i class="fa-solid fa-plane"></i> Destaques de Voos Encontrados:</strong>';
    flights.forEach((f) => {
      const priceStr = f.price ? `R$ ${f.price}` : "Consulte";
      const airline = f.airline || "Companhia Aérea";
      const dep = f.departure ? `Partida: ${f.departure}` : "";
      html += `
        <div class="card-item">
          <div>
            <div class="card-title">${escapeHtml(airline)}</div>
            <div class="card-sub">${escapeHtml(dep)}</div>
          </div>
          <div class="card-price">${priceStr}</div>
        </div>
      `;
    });
    html += "</div>";
    return html;
  }

  function renderHotelCards(hotels) {
    let html =
      '<div class="cards-container"><strong><i class="fa-solid fa-hotel"></i> Destaques de Hospedagem:</strong>';
    hotels.forEach((h) => {
      const priceStr = h.price ? `R$ ${h.price}` : "Consulte";
      const name = h.name || "Hospedagem";
      const rating = h.rating ? `⭐ ${h.rating}` : "";
      html += `
        <div class="card-item hotel-card">
          <div>
            <div class="card-title">${escapeHtml(name)} ${rating}</div>
            <div class="card-sub">${escapeHtml(h.address || "")}</div>
          </div>
          <div class="card-price">${priceStr}</div>
        </div>
      `;
    });
    html += "</div>";
    return html;
  }

  function scrollChatToBottom() {
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === "error" ? "fa-triangle-exclamation" : "fa-circle-check"}"></i> ${escapeHtml(message)}`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
});
