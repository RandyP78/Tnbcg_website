# TEKNIK remediation engine

Core logic for automated remediation of DNS (GoDaddy) and Microsoft 365
(Entra) misconfigurations. No credentials required to run the tests.

    npm test        # 25 tests, all green

## Shape

    lib/operation.js   the contract every change must implement
    lib/executor.js    the only path to a write
    lib/planner.js     where Claude is used, and how it is contained
    lib/ops/dns.js     GoDaddy DNS operations
    lib/ops/graph.js   Entra ID operations
    test/mocks.js      in-memory DNS + Graph doubles

## The three rules

**1. Claude never authors a write.** It picks operation ids from a fixed
catalogue and writes the customer-facing explanation. Every payload is
hand-written code. `validatePlan()` discards any id not in the registry,
so even a fully hijacked model response cannot express an action outside
the catalogue.

**2. Conditional Access is always report-only, and never without a
break-glass exclusion.** The preconditions hard-fail if no cloud-only
emergency-access account exists, and refuse an exclusion list containing
a synced account. A test asserts no operation in the catalogue can
produce an enforcing policy.

**3. Verification failure rolls back automatically.** If a change cannot
be independently confirmed, the executor reverses it rather than leaving
the system in an unknown state. If the rollback also fails, it says so
loudly and returns the undo data for manual use.

## Operations

| id | risk | notes |
|---|---|---|
| `dns.dmarc.remove_duplicates` | medium | Two DMARC records means receivers ignore DMARC entirely |
| `dns.dmarc.create_monitoring` | low | Always p=none first; never straight to reject |
| `dns.spf.tighten_all` | high | Refuses above the 10-lookup limit; never removes mechanisms |
| `graph.ca.block_legacy_auth` | high | Report-only |
| `graph.ca.require_admin_mfa` | high | Report-only |

## What is deliberately absent

No credential storage. Tokens live in memory for one run.
No `force` flag. Approval is per-operation-id and cannot be skipped.
No Exchange Online yet — it needs a separate consent path.

## Wiring it up

Implement two clients against the mock interfaces in `test/mocks.js`:

    dns:   listRecords(domain) -> [{type,name,data,ttl}]
           replaceRecords(domain, type, name, records)

    graph: listGlobalAdmins()
           listConditionalAccessPolicies()
           createConditionalAccessPolicy(policy)
           deleteConditionalAccessPolicy(id)

GoDaddy note: their Domains API now restricts access by account tier.
Confirm your account qualifies before building against it.
