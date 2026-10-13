# Testing record

## Automated integration suite

Run after setting `DATABASE_URL` and applying the Prisma schema:

```sh
pnpm db:generate
pnpm db:push
pnpm test:integration
```

Last run: 13 October 2026.

| Check | Result | Evidence |
| --- | --- | --- |
| Chat service stores customer and assistant messages in SQLite through Prisma | Pass | Two related message records were retrieved from the database. |
| AI provider adapter sends an authenticated HTTP request and parses the response | Pass | A controlled HTTP response verified the OpenAI endpoint, bearer header, and assistant reply parsing. |
| Live OpenAI models endpoint | Skipped | Set `OPENAI_API_KEY` to run this check against the real provider. |

The first two checks completed successfully. The live provider check is conditional so CI can run without sharing an API secret. The provider connection endpoint is available at `/api/integrations/openai`.

## Manual user acceptance walkthrough

Developer walkthrough on 13 October 2026 using the local app:

| Scenario | Result |
| --- | --- |
| Open a new support chat and see the welcome message and suggested topics | Pass |
| Select “Improve my Wi-Fi” and receive a relevant response in support mode | Pass |
| Confirm the conversation remains in recent chats and history after refresh | Pass |
| Confirm the interface indicates local support mode when no AI key is configured | Pass |

The network status panel is sample demonstration data. Account lookup, service diagnostics, and handoff are not connected to real provider systems.

## Later testing work

Jest unit tests, Playwright end-to-end tests, and an 80% coverage target are intentionally deferred. The real provider connectivity check should be run in an environment with an approved OpenAI key before a live AI demonstration.
