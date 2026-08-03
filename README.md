# Kirana-Management-TeleChat

Manage a Kirana store from a Telegram chat bot.

Component 1 delivers the **transport boundary**: a Cloudflare Worker that receives Telegram webhooks, routes each Telegram user to their own Store Durable Object, and delivers outbound replies via the Telegram Bot API.

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/system_Architecture.md](docs/system_Architecture.md) | Full system architecture |
| [docs/agent-traceability-and-agent-state.md](docs/agent-traceability-and-agent-state.md) | Agent state, traceability, harness model, C4 audit requirements |
| [docs/goals/component-01-worker-telegram-adapter.md](docs/goals/component-01-worker-telegram-adapter.md) | Component 1 goal document & acceptance criteria |
| [running.md](running.md) | Deploy, webhook setup, validation, troubleshooting |

## Architecture summary

```
Telegram → POST /webhook → Worker (stateless)
                              ↓ RPC
                    Store Durable Object (per user)
                              ↓
                    ExecutionResult → Telegram Bot API
```

- **Worker** (`src/worker-telegram-adapter/`) — webhook validation, update parsing, multi-tenant routing (`storeId = String(telegramUserId)`), `ApplicationRequest` normalization, async `waitUntil` handoff, outbound `sendMessage` / `sendDocument`.
- **Store Durable Object** (`src/store-durable-object/`) — stub in Component 1: `/start` → welcome; all other supported text → placeholder greeting. Grows into full store runtime in later components.
- **Contracts** (`src/worker-telegram-adapter/contracts/`) — `ApplicationRequest` and `ExecutionResult` (including attachment types) are the only Worker ↔ DO interface.

## Design decisions (Component 1)

| Topic | Decision |
|-------|----------|
| Tenancy | One Telegram `from.id` = one store = one DO (`idFromName(storeId)`) |
| Worker → DO | Cloudflare RPC `handleApplicationRequest` |
| Webhook timing | HTTP 200 after handoff; DO + Telegram outbound in `ctx.waitUntil()` |
| Unsupported inbound | No DO call; reply with fixed string; still 200 |
| Commands | `bot_command` entity detection (not regex) |
| Telegram types | `@grammyjs/types` only; thin `fetch`-based API client |
| Testing | Pure logic unit tests with real Update fixtures; integration against deployed worker (see `running.md`) |

## Project structure

```
src/
├── index.ts                    # Thin bootstrap (POST /webhook only)
├── worker-telegram-adapter/    # Component 1 — transport boundary
│   ├── contracts/              # ApplicationRequest, ExecutionResult
│   ├── telegram/               # Command parsing (bot_command entities)
│   ├── fixtures/               # Real-shaped Telegram Update JSON
│   ├── integration/            # Production integration tests
│   └── *.ts                    # Pipeline modules + colocated unit tests
└── store-durable-object/       # Component 3 stub (grows in later components)
```

Unit tests cover pure deterministic logic (parsers, normalizer, handler). Colocated as `*.test.ts`. Run with `npm test` — see [running.md](running.md) for full suite with `.dev.vars`.

## Bot status

| Field | Value |
|-------|-------|
| Bot @username | _(fill after BotFather creation)_ |
| Deployed URL | _(fill after `npm run deploy`)_ |
| Deploy status | _(fill after deploy)_ |

## User-facing strings (locked)

| Situation | Message |
|-----------|---------|
| Unsupported inbound | `I only support text conversations right now.` |
| Generic error | `We're facing some problems right now. Please try again later.` |
| Stub greeting | `hi MF it's good to see you` |

## Operations

See **[running.md](running.md)** for deploy, secrets, webhook registration, production validation, and `wrangler tail`.
