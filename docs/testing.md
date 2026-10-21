# Testing record

## Automated integration suite

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

## Manual user acceptance walkthrough

Developer walkthrough on 13 October 2026 using the local app:

| Scenario                                                                        | Result |
| ------------------------------------------------------------------------------- | ------ |
| Open a new support chat and see the welcome message and suggested topics        | Pass   |
| Select “Improve my Wi-Fi” and receive a relevant response in support mode       | Pass   |
| Confirm the conversation remains in recent chats and history after refresh      | Pass   |
| Confirm the interface indicates local support mode when no AI key is configured | Pass   |

The network status panel is sample demonstration data. Account lookup, service diagnostics, and handoff are not connected to real provider systems.

## Automated test suites

The repository includes Jest unit tests, Node integration tests, and Playwright end-to-end tests. CI runs the unit and integration suites, linting, formatting checks, and a production build. Playwright is configured for local runs but is not part of the CI workflow.

### Jest unit tests and coverage

Run:

```sh
pnpm test:unit
```

The suite exercises the server libraries and API route handlers, including validation, authorization, persistence failures, local fallback responses, and streamed AI behavior. Jest enforces a minimum of 80% for statements, branches, functions, and lines across `src/lib` and `src/app/api`. It writes an LCOV report to `coverage/lcov.info`.

Last run: 21 October 2026. All 74 tests passed; coverage was 98.94% statements, 88.61% branches, 100% functions, and 99.55% lines.

React pages and components are not included in Jest's coverage collection. The configured Playwright scenarios exercise customer message sending, fallback support responses, and starting a new conversation:

```sh
pnpm exec playwright install chromium
pnpm exec playwright test
```

The browser tests expect local support mode, so run them without a configured `OPENAI_API_KEY`.

### Follow-up testing work

A project-wide coverage target for the React UI and further accessibility-focused visual tests remain future work. The real provider connectivity check should be run in an environment with an approved OpenAI key before an AI-backed demonstration.
