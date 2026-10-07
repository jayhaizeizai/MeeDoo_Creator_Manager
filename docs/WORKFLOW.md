# Creator Operations Workflow
Version: 0.2 — proposed MVP, not a frozen production schema.

## Product scope
Agent Inbox is the daily work queue: drafts to review, decisions needed, waiting for creator and fulfillment blockers.
Supporting views: Dashboard, Creators, Pipeline, Shipping, Agreements/Clickwrap, Content Review, Knowledge/Policies and Settings.
A creator can have multiple collaborations. Store people, social accounts and conversations separately from campaign-specific terms, products, shipments and deliverables.

## State and next action
Use collaboration stage plus independent blockers rather than a single overloaded status.
Proposed stages:
NEW_LEAD → CONTACTED → REPLIED → INTERESTED → LOOKBOOK_SENT → LOOK_SELECTED → TERMS_SENT → AGREED → READY_TO_SHIP → SHIPPED → DELIVERED → CONTENT_DUE → CONTENT_RECEIVED → CONTENT_APPROVED → PUBLISHED → PERFORMANCE_REVIEW → RETURN_VALIDATION → COMPLETED.
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
1. Treatment of the edited Danielle no-commission draft; general Level 1 reference is now 10% under the Playbook.
2. Current product/size guide and Lookbook.
3. Shipping eligibility, costs, duties, stock source and release process.
4. Follow-up cadence, campaign timezone and content deadline cutoff.
5. CSV schema and existing record identifiers.
6. Gmail/Lark deployment, access roles and credential configuration.
7. Technology stack and hosting.
No automatic sending or recurring email checks are enabled by these documents.

## Required Clickwrap and Playbook extensions
See [CLICKWRAP_SPEC.md](CLICKWRAP_SPEC.md) for the required creator agreement page, verification, immutable terms, acceptance receipt and evidence export.
AGREED requires authoritative acceptance of the issued version. Verified email acceptance remains a separate supported source. Stock and shipping gates remain independent.
Before issuing terms verify products and measurements. Before shipping record acceptance. After delivery collect fit/movement, initial quality and improvement feedback for both garments.
Uploaded content enters review (target within 24 hours), with one reasonable correction. Written approval precedes the organic tracking package and publication. Record live URL and disclosure/CTA evidence.
Track Day-15 provisional performance separately from rolling return-adjusted validation. Later eligible conversions remain open after the trial ends.
Store level memberships and effective rates independently from pipeline stages. Level 2 is 30 days/12% and two activations; Level 3 is a 90-day/15% pilot with agreed monthly activations. Promotion requires review and new terms.
Add agreement_templates, agreement_instances, agreement_events, agreement_acceptances, receipt_exports, content_reviews, level_memberships, tracking_links, attributed_orders, commission_ledger and content_licenses to the proposed model.
Track separate clocks for production, publication/trial, attribution, order validation, organic license and paid license activation/use. Completion of content work does not close pending commission liabilities or license timers.
Attribution implementation remains blocked on organic-code versus last-paid-click tie-breaking and code-only timing. Payment method/deadline and hold durations must be configured before issuing complete terms.
