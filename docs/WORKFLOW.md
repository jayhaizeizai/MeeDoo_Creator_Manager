# Creator Operations Workflow
Version: 0.1 — proposed MVP, not a frozen production schema.

## Product scope
Agent Inbox is the daily work queue: drafts to review, decisions needed, waiting for creator and fulfillment blockers.
Supporting views: Dashboard, Creators, Pipeline, Shipping, Knowledge/Policies and Settings.
A creator can have multiple collaborations. Store people, social accounts and conversations separately from campaign-specific terms, products, shipments and deliverables.

## State and next action
Use collaboration stage plus independent blockers rather than a single overloaded status.
Proposed stages:
NEW_LEAD → CONTACTED → REPLIED → INTERESTED → LOOKBOOK_SENT → LOOK_SELECTED → TERMS_SENT → AGREED → READY_TO_SHIP → SHIPPED → DELIVERED → CONTENT_DUE → CONTENT_RECEIVED → COMPLETED.
Stages may be skipped when evidence supports it; message order varies.
PAID_ONLY, DECLINED, NO_RESPONSE, FOLLOW_UP_LATER and BOUNCED are dispositions, not shipping milestones.
Missing size, missing address, fit issue, stock issue and missing agreement are independent blockers that can coexist.
Keep next_action, action_owner, due_at and waiting_reason distinct from stage.

## Transition gates
| Transition | Required evidence |
| --- | --- |
| CONTACTED / LOOKBOOK_SENT / TERMS_SENT | Successful outbound send containing the relevant material |
| LOOK_SELECTED | Explicit selection mapped to approved product |
| AGREED | Explicit acceptance of the applicable version of terms |
| READY_TO_SHIP | Agreement, approved product and sizes, verified shipping details, stock and shipping eligibility |
| SHIPPED | Fulfillment confirmation; preserve tracking/carrier when available |
| DELIVERED | Carrier or creator delivery confirmation |
| CONTENT_DUE | Receipt and correct fit both confirmed; compute deadline from later event |
| CONTENT_RECEIVED | Required assets received, with completeness tracked |
| COMPLETED | Agreed deliverables and posting obligations verified, open issues resolved |

An automatically purchased tracking label is not by itself proof of shipment.
Five calendar days is the supplied deadline; campaign timezone and exact cutoff must be set before automated overdue notices.
One received asset does not prove all deliverables are complete.
Manual exceptions require a reason, actor and audit entry.

## Agent Inbox flow
Sync full conversation → identify actionable reply → extract proposed facts → validate against terms/policies → draft or request decision → human review → refresh thread → send → confirm provider result → apply validated state changes.
Show why the draft was proposed, source evidence and unknowns.
Human edits remain authoritative. Never overwrite manual data with a lower-confidence extraction.

## Data entities
creators, social_accounts, collaborations, collaboration_terms, products, collaboration_products, email_threads, email_messages, agent_runs, drafts, approvals, shipments, deliverables, affiliate_accounts, policies, activity_logs, users.
State changes and policy changes record before/after values, actor, timestamp and source.
Separate immutable agreed terms snapshots from editable defaults.

## Imports and integrations
- CSV: original export has not been supplied. Field mapping remains pending. Preview changes and conflicts before import; preserve source IDs and provenance.
- Deduplication: stable source IDs and verified social/email identities; ambiguous matches require review.
- Reimport: update source metrics without overwriting manual CRM state or accepted commercial terms.
- Gmail: full threads including Sent, incremental sync, idempotency and verified recipient mapping. This chat's connector access is not app OAuth authorization.
- Lark: planned login and notifications; app credentials, scopes and recipients remain to be configured.
- Modash: CSV initially. No assumption that its API supports CRM tag writes.
- Affiliate: store approved links, codes and rates first; revenue/click reporting requires a verified data source.
- Visual design: original screenshot is unavailable here; left navigation, purple primary color and cards are discussion-level guidance pending the reference.

## Open decisions before implementation
1. Default commission and treatment of the edited Danielle no-commission draft.
2. Current product/size guide and Lookbook.
3. Shipping eligibility, costs, duties, stock source and release process.
4. Follow-up cadence, campaign timezone and content deadline cutoff.
5. CSV schema and existing record identifiers.
6. Gmail/Lark deployment, access roles and credential configuration.
7. Technology stack and hosting.
No automatic sending or recurring email checks are enabled by these documents.
