# Cheetah Broadband Customer Care

A customer-support chatbot prototype for Cheetah Broadband, a fictional UK internet provider. The app provides a React chat interface, Next.js API routes, a Prisma/SQLite conversation store, an optional OpenAI integration, and a local responder when AI credentials are not configured.

## Requirements

- Node.js 20.9 or newer
- pnpm 11.7 or newer

## Run locally

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env` and keep the SQLite URL as `file:./dev.db`.
3. Optionally set `OPENAI_API_KEY` to enable live AI responses. The app remains usable without it.
4. Generate the database client and create the local schema with `pnpm db:generate` and `pnpm db:push`.
5. Start the app with `pnpm dev` and open the local URL shown in the terminal.

The app provides sample network status and support contact details for demonstration. It does not connect to Cheetah Broadband account or network systems.

## Engineering notes

- `ChatService`, `OpenAIProvider`, and `FallbackSupport` separate orchestration, external AI communication, and local support responses.
- The server uses asynchronous HTTP requests with a timeout and validates user input before persistence.
- Conversations and messages are stored in SQLite through Prisma.
- API routes handle errors centrally and emit concise console diagnostics. Do not log customer message contents or credentials.
- `/api/health` checks database connectivity; `/api/integrations/openai` checks the optional third-party AI connection.
- GitHub Actions installs dependencies, generates Prisma, applies the schema, runs integration tests, lints, and builds.

## Integration testing

Run `pnpm db:generate`, `pnpm db:push`, and `pnpm test:integration` after setting `DATABASE_URL`. The integration suite exercises the chat-service/database flow and the OpenAI request adapter with a controlled HTTP response. If `OPENAI_API_KEY` is set, it also calls the real OpenAI models endpoint. That live check is skipped in CI unless a key is provided.

## Deferred work

Jest unit tests, Playwright end-to-end tests, 80% coverage target, logging library, Prettier configuration, and accessibility-focused visual refinements are intentionally not included yet.

## Academic integrity

This prototype was developed with AI assistance. Review and adapt the source, test it, and acknowledge AI use in the format required by your module before submission.
