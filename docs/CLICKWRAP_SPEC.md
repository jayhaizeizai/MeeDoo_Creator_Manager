# Contract Clickwrap
Version: 0.1 — required product capability, confirmed by Jay on 2026-10-07.
This specifies software behavior and evidence preservation, not a guarantee of legal enforceability. Contract text and applicable jurisdiction remain separate decisions.

## Scope
Build a creator-facing agreement page and internal agreement/evidence panel.
Level 1 acceptance must be recorded before shipping. Support new agreement instances for Level 2, amendments and future levels; the Playbook's Level 3 signed-agreement requirement remains a separate signing-method decision, not automatically satisfied by a checkbox.
Email acceptance is an explicit alternative in the Playbook and must be recorded as EMAIL_ACCEPTANCE with the exact terms and source message, never represented as a clickwrap event.

## Creator flow
1. Open a unique invitation tied to one creator, collaboration and immutable terms version.
2. Verify access through the intended creator email using an expiring authentication link or email code. Do not rely on possession of an unverified forwarded URL as conclusive identity.
3. Show full downloadable terms and conspicuous material terms: gift, deliverables/publication, timing, disclosure, commissions/payment, attribution, organic license and limited paid license.
4. Show an initially unchecked agreement checkbox and explicit "I agree to these terms" submission button. Capture the exact displayed assent language and dated/versioned agreement.
5. Accept only an explicit authenticated POST, never a page view or GET. Email security scanners and previews cannot accept terms.
6. After the server commits acceptance, show a receipt ID, accepted version, timestamp and downloadable copy. Transactional receipt email is an application feature to configure, not authorization to send messages during this documentation task.

## Issuing terms
Human reviews the complete rendered instance before issue. Block unresolved placeholders including payment method/deadline, selected products, platform/account and publication timing.
If a variable is intentionally deferred to an agreed brief, identify that rule explicitly and preserve the linked brief/version; do not allow hidden mutable material terms.
Separate template version from the fully rendered per-creator agreement. Save referenced attachments as immutable versions.
Never replace terms behind a sent link. Amendments create new instances; supersede/revoke pending invitations with an audit entry. Existing acceptance records survive.
No automatic acceptance or signature by the Agent.

## Evidence model
- agreement_templates: version, source, content, author and approval.
- agreement_instances: creator/collaboration IDs, level, exact rendered snapshot, attachment versions, content hash and algorithm, issued time, issuer, validity and status.
- agreement_events: issued, viewed (not accepted), revoked, expired, accepted; event time from server and actor.
- agreement_acceptances: unique receipt, instance/version/hash, verified identity and verification method, exact assent text, server UTC time, UI version, request ID and method.
- Optional IP and user-agent collection must be documented in the privacy notice with approved retention/access controls before enablement.
- receipt_exports: snapshot plus acceptance record and relevant audit timeline.
Hashes detect changes against a trusted stored value; hashes alone are not tamper-proof storage. Preserve append-only audit records, restrict writes/deletes, version stored snapshots and maintain backups.
Keep tokens and identity/acceptance evidence out of Git and ordinary application logs.

## State and transaction rules
DRAFT → ISSUED → ACCEPTED; pending instances can also become EXPIRED, REVOKED or SUPERSEDED.
Commit acceptance atomically with a unique instance/acceptor constraint and an outbox event. Repeat submissions return the same receipt.
Validate authentication, expiry, revocation, version and checkbox intent server-side. CSRF protection, rate limiting and secure token storage are required.
If terms are superseded while the page is open, reject the old submission and display the new version for fresh review.
Acceptance can clear the agreement blocker; READY_TO_SHIP still requires product, sizing, address, stock and shipping checks.
CRM update/receipt failures retry independently without duplicating the acceptance.
Viewing, opening an email, clicking an invitation and accepting are different events.

## Internal UI and Agent use
Show agreement version, issued/accepted timestamps, verification method, source type, current status and evidence download.
Agent may prepare invitations and explain approved terms, then queue outbound messages for human approval.
Agent reads acceptance from the authoritative server record; it cannot set ACCEPTED from inferred interest.
Show upcoming organic/paid license expiry separately from agreement acceptance and commission term dates.

## Acceptance checks for implementation
- Unchecked submission rejected; GET/scanner requests never accept.
- Expired, revoked, forwarded-without-verification and superseded invitations cannot accept.
- Duplicate clicks and timeouts yield one receipt.
- New template version leaves old snapshot and receipt unchanged.
- Concurrent revocation and acceptance resolve transactionally with an audit record.
- CRM failure does not lose acceptance; retry does not duplicate it.
- Downloaded evidence matches the actual displayed/accepted terms and linked attachments.
- Mobile and keyboard users can review full terms and submit explicitly.
- An admin cannot create creator assent by manually changing CRM status.

## Decisions needed
Final contract text and issuer entity; verification method; invitation expiry; privacy notice/retention; legal review by relevant jurisdiction; Level 3 signature method.
