# faltei.

Gestor estratégico e bem-humorado de presença e orçamento de faltas para universitários (Medicina UNIRIO — catálogo base **2026.2** e atualizador para **2027.1+**).

## Funcionalidades Principais

- **Grade Semanal Proporcional (`07:00`–`19:00`)**: Visualização horária proporcional (`1h = 52px`) com coluna fixa de horários no mobile, swipe horizontal centralizado no dia atual, modo *Zoom Semana Inteira*, linha ao vivo do horário atual e bottom sheet contextual de 1 toque.
- **Motor Avançado de Tipos de Falta (`blocosAula`)**: Suporte a dias com múltiplos turnos (ex.: Manhã + Tarde), registro de falta por **Dia Completo**, **Só Manhã / Só Tarde / Só Noite** ou **Parcial / Atraso** hora a hora, além de tradução automática para dias reais desiguais.
- **Calendário Acadêmico, Simulador e Consenso da Turma**: Avisos coletivos por disciplina (`disciplinaKey`), consenso de **Sem Aula**, eventos pessoais (provas, trabalhos, grupos, seminários) e simulador de viagens/feriadões.
- **Atualizador de Semestre com Gemini Structured Outputs**: Área administrativa protegida para extrair novas grades (PDF, CSV, imagem ou texto), revisar diff e publicar o novo semestre no Cloud Firestore.
- **PWA Offline-First**: Manifesto web e Service Worker gerados automaticamente via `vite-plugin-pwa` com limpeza de caches antigos e ativação imediata (`skipWaiting`, `clientsClaim`).

## Desenvolvimento Local

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Configure o ambiente a partir de `.env.example` (defina `GEMINI_API_KEY` no servidor; nunca exponha chaves secretas no cliente).
3. Inicie o servidor full-stack (Express + Vite middleware na porta `3000`):
   ```bash
   npm run dev
   ```

## Testes e Verificação

- **Testes unitários** (motor de faltas, blocos por turno e geometria semanal):
  ```bash
  npx tsx --test src/utils/attendance.test.ts
  ```
- **Checagem TypeScript**:
  ```bash
  npm run lint
  ```
- **Lint das regras do Firestore**:
  ```bash
  npx eslint firestore.rules
  ```

## Regras do Firestore & Governança Admin

- O esquema completo e os caminhos de coleções estão documentados em `firebase-blueprint.json` e `security_spec.md`.
- Leituras de `/config` e `/catalogo_disciplinas` exigem usuário autenticado (`request.auth != null`).
- Escritas globais no catálogo, semestre oficial e publicação de avisos oficiais são restritas exclusivamente ao administrador (`mat.ben.henrique@gmail.com` com `email_verified == true`).

## Build e Produção (Cloud Run / Node)

```bash
npm run build
NODE_ENV=production npm start
```

O servidor Express serve `dist/` estaticamente e expõe os endpoints `/api/*` em `0.0.0.0:$PORT` (padrão `3000`).
