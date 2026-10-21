# Testing record

## Automated test suites

The repository has Jest unit tests, Node integration tests, and Playwright end-to-end tests. CI runs the unit and integration suites, linting, formatting checks, and a production build.

### Integration tests

Run after setting `DATABASE_URL` and applying the Prisma schema:

```sh
pnpm db:generate
pnpm db:push
pnpm test:integration
```

Last run: 13 October 2026.

| Check                                                                           | Result  | Evidence                                                                                             |
| ------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| Chat service stores customer and assistant messages in SQLite through Prisma    | Pass    | Two related message records were retrieved from the database.                                        |
| AI provider adapter sends an authenticated HTTP request and parses the response | Pass    | A controlled HTTP response verified the OpenAI endpoint, bearer header, and assistant reply parsing. |
| Live OpenAI models endpoint                                                     | Skipped | Set `OPENAI_API_KEY` to run this check against the real provider.                                    |

The first two checks completed successfully. The live provider check is conditional so CI can run without sharing an API secret. The provider connection endpoint is available at `/api/integrations/openai`.

### Unit tests

Run the Jest suite with:

```sh
pnpm test:unit
```

The current tests cover fallback responses, chat persistence, and parsing an OpenAI-compatible response with a mocked fetch implementation.

### Playwright end-to-end tests

Install the Chromium browser once, then run the configured browser suite:

```sh
pnpm exec playwright install chromium
pnpm exec playwright test
```

The Playwright configuration starts the development server and prepares the SQLite schema. The current scenarios cover sending a customer message, receiving the local support response, and starting a new conversation. These tests expect support mode, so run them without a configured `OPENAI_API_KEY`.

## Manual user acceptance walkthrough

Developer walkthrough on 13 October 2026 using the local app:

| Scenario                                                                        | Result |
| ------------------------------------------------------------------------------- | ------ |
| Open a new support chat and see the welcome message and suggested topics        | Pass   |
| Select “Improve my Wi-Fi” and receive a relevant response in support mode       | Pass   |
| Confirm the conversation remains in recent chats and history after refresh      | Pass   |
| Confirm the interface indicates local support mode when no AI key is configured | Pass   |

The network status panel is sample demonstration data. Account lookup, service diagnostics, and handoff are not connected to real provider systems.

## Follow-up testing work

No coverage threshold is configured. The real provider connectivity check should be run in an environment with an approved OpenAI key before an AI-backed demonstration.
