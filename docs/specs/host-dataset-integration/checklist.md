# Acceptance Checklist

- [x] No legacy arbitrary-JSON host-resource parameter branch remains in public types, parser, schema, fixtures, examples, or docs.
- [x] Canonical dataset responses reject unknown fields, duplicate/over-limit fields, undeclared row keys, invalid cells, non-finite numbers, and non-ISO dates.
- [x] Dataset catalog capability and port disagreement fail closed; missing resources or variables never trigger a host query.
- [x] Host requests contain only component/resource identity and evaluated ordinary JSON parameters.
- [x] Binding declarations are serializable and adapters are runtime-only; adapter exceptions are isolated.
- [x] Table projection accepts arbitrary selected fields and chart projection enforces one dimension plus 1..8 numeric measures.
- [x] Static variables load before host variables; variable changes refresh only dependent components.
- [x] Initial load, manual refresh, timeout, cancellation, replacement, unload, and late results have verified state transitions.
- [x] Designer data controls are keyboard accessible, localized, capability gated, and transactional.
- [x] Browser harness proves table/chart rendering, variable requery, manual refresh, safe failure, timeout, and instance isolation.
- [x] Test matrix, usage/integration documentation, API, boundary, tarball, and M0 verification reflect current evidence.
- [x] Data authoring exposes no data, static data, and host-managed datasets without exposing API, SQL, database, or credential configuration.
- [x] Existing dataset bindings restore automatically and the pane distinguishes catalog discovery from resource querying.
- [x] Materials without declared data capabilities do not expose a Data inspector tab.
- [x] The data pane exposes apply/refresh actions without a dedicated preview action.
- [x] The right inspector reserves scrollbar space and does not change width when switching data-source views.
- [x] Dataset apply and refresh actions remain fully visible when the inspector scrolls.
