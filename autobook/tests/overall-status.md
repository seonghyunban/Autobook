# Overall Status

## Summary

| Date & Time | Total Stmts | Covered | Missing | Coverage % | Notes |
|---|---|---|---|---|---|
| 2026-03-23 | 2475 | 1305 | 1170 | 49% | baseline |
| 2026-03-23 | 2216 | 2151 | 65 | 96% | 258 tests passing |
| 2026-03-26 | 3090 | 2634 | 456 | 82% | 217 tests passing; fixed stale tests after backend refactor |

## Per Directory

| Directory | Backend Module(s) | Stmts | Miss | Coverage % |
|---|---|---|---|---|
| tests/ | config.py, local_identity.py | 80 | 0 | 100% |
| tests/api/ | api/main.py, api/dependencies.py | 37 | 0 | 100% |
| tests/api/routes/ | api/routes/*.py (6 measured) | 194 | 18 | 91% |
| tests/auth/ | auth/deps.py, token_service.py, mock_cognito.py, schemas.py | 268 | 18 | 93% |
| tests/cache/ | cache/redis.py | 12 | 0 | 100% |
| tests/db/ | db/connection.py, db/credentials.py | 31 | 1 | 97% |
| tests/db/dao/ | db/dao/*.py (7 files) | 353 | 8 | 98% |
| tests/db/models/ | db/models/*.py (18 files) | 490 | 2 | 100% |
| tests/queues/ | queues/*.py (sqs/client, pubsub/client, pubsub/pub, pubsub/sub) | 122 | 52 | 57% |
| tests/reporting/ | reporting/statements.py | 90 | 1 | 99% |
| tests/schemas/ | schemas/*.py (8 files) | 114 | 0 | 100% |
| tests/services/agent/ | services/agent/service.py, graph/state.py, accounting_engine/rules.py | 53 | 0 | 100% |
| tests/services/flywheel/ | services/flywheel/aws.py, service.py | 12 | 0 | 100% |
| tests/services/ml_inference/ | services/ml_inference/aws.py, service.py, logic.py, providers/*.py | 519 | 234 | 55% |
| tests/services/normalizer/ | services/normalizer/aws.py, service.py, logic.py | 198 | 29 | 85% |
| tests/services/posting/ | services/posting/aws.py, service.py | 88 | 12 | 86% |
| tests/services/precedent/ | services/precedent/aws.py, service.py, logic.py | 150 | 34 | 77% |
| tests/services/resolution/ | services/resolution/aws.py, service.py | 75 | 10 | 87% |
| tests/services/shared/ | services/shared/parse_status.py, routing.py, transaction_persistence.py | 117 | 53 | 55% |

## Omitted from Coverage

| Path | Reason |
|---|---|
| `services/ws_relay/*` | WebSocket relay — while True loop, DynamoDB at module level |
| `services/*/__main__.py` | Lambda entry points |
| `vectordb/*` | Qdrant init scripts |
| `api/routes/ws.py` | Requires live WebSocket client + Redis |
| `api/routes/events.py` | Requires live SSE stream + Redis |
| `services/agent/*` (except service.py, graph/state.py) | LLM agent pipeline — excluded from coverage config |
| `accounting_engine/*` (except rules.py) | Accounting engine stubs — excluded from coverage config |

## History

| Date & Time | Coverage % | Notes |
|---|---|---|
| 2026-03-23 | 49% | baseline |
| 2026-03-23 | 96% | 258 tests, all passing |
| 2026-03-26 | 82% | 217 tests, all passing; fixed 21 stale test files after backend refactor (handler→aws, process→service, queue restructure, parse route changes, logic drift) |
