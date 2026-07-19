# Prompt 2: Refinamento de UX - Limpeza do Prompt de Entrada

Este prompt registra o pedido de ajuste na experiência do usuário para limpar a caixa de entrada de texto após o envio da primeira mensagem.

---

## 📄 Texto do Prompt Enviado

```text
ao enviar a primeira mensagem pode limpar o prompt do usuario para poder seguir interagindo com o agent
```

---

## 🛠️ Resposta e Alterações Implementadas

- **Arquivo Modificado**: `public/app.js` na função `sendMessage()`.
- **Comportamento Adicionado**:
  1. Assim que a mensagem do usuário é adicionada ao feed do chat, o valor do campo de texto `promptInput.value` é redefinido para string vazia `""`.
  2. O estado `isUserCustomPrompt` é ajustado para que o campo permaneça limpo, permitindo que o usuário digite livremente mensagens continuadas ao agente (ex: _"Mostre mais opções de hotéis"_, _"Tem alguma opção de voo à tarde?"_).
  3. Caso o usuário queira restaurar a mensagem gerada pelos filtros no painel lateral, ele pode alterar um filtro ou clicar no botão **"Restaurar Gerado"**.
