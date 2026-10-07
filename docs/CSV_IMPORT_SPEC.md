# Creator CSV Import Specification
Version 0.1 — 2026-10-07. Source: user-supplied Tictok KOL_数据表_表格 (3).csv.
This document contains schema and aggregate findings only. Raw source rows and personal contact data are not committed.
No production import or outreach has been performed.

## Observed profile
UTF-8-compatible CSV (read with utf-8-sig), 553 data rows, 15 columns.
553 nonempty account URLs, 526 distinct raw strings.
Removing URL query strings/trailing slashes and case-normalizing account paths gives 491 candidate accounts, 55 duplicate groups and 62 excess rows. These are matching candidates, not 491 verified unique people. Import must validate host/platform before applying the path-based match.
Within duplicate groups, 37 groups have different nonempty Owner values, 40 follower values, 3 Collab email values. Different raw URL forms occur in 35 groups.
124 nonempty Collab email cells: 67 directly syntactically valid addresses after mailto removal, all distinct; 57 mixed notes/links/malformed entries. Syntax does not establish deliverability or recipient identity.
Media Kit has one nonempty value. Every row has Owner and follower count.
Source has no stable record ID, timestamps, confirmed outreach stage, accepted terms or shipping records.

## Complete field map
| CSV column | Target | Import behavior |
| --- | --- | --- |
| Tictok KOL | social_accounts.platform, handle, canonical_url; source_url | Validate TikTok host and account path; preserve original; no network navigation necessary |
| Priority 1 | creator_review.priority_flag | 1=true, 0=false, blank=unknown; not collaboration stage |
| Selling Own Products | creator_review.sells_own_products | Tri-state source observation; preserve provenance |
| Collab email | contact_candidates + source_notes | Classify address, embedded candidate, redirect link, operational note or malformed text |
| Media Kit | creator_resources.media_kit_url | Validate URL; retain source; do not automatically fetch arbitrary links |
| Owner | owner_mapping.source_label → user_id | Explicit mapping; conflicting owners require review |
| 关注者数量 | social_metric_snapshots.followers | Unit parsing and raw value; observation date unknown |
| 人种 | restricted legacy attribute / excluded from active CRM | Recommend no active import or Agent use; preserve original source outside Git, pending explicit data-retention decision |
| 品牌匹配 | creator_review.brand_fit | Historical human assessment, tri-state, not current eligibility |
| 有小型狗 | creator_review.small_dog_present | Historical observation; no fabricated dog profile |
| 身材适配 | creator_review.legacy_fit_assessment | Manual historical label, not measurements or inferred body dimensions |
| 时尚 | creator_review.style_fit | Historical manual assessment, not objective fact |
| 英语内容 | creator_review.english_content | Source observation, blank unknown |
| 没有自己品牌 | creator_review.no_own_brand | Preserve separately from sells_own_products; semantics are not exact inverses |
| 没有脸 | creator_review.no_face_visible | 1 means no face; do not invert silently or infer identity |

All qualification fields are observations with unknown original evaluation date. Do not automatically reject or score creators from demographic/appearance fields. This is a proposed handling policy, not deletion of the supplied source.

## Binary values and missingness
Priority 1: 114 true, 13 false, 426 blank.
Selling Own Products: 46 true, 3 false, 504 blank.
品牌匹配: 513 true, 40 blank.
有小型狗: 518 true, 5 false, 30 blank.
身材适配: 395 true, 14 false, 144 blank.
时尚: 405 true, 13 false, 135 blank.
英语内容: 491 true, 4 false, 58 blank.
没有自己品牌: 425 true, 12 false, 116 blank.
没有脸: 72 true, 8 false, 473 blank.
Never coerce blank to false. Unexpected values go to validation errors.

## Owner resolution
Source labels and row counts: yihan 96; Yasmine 109; Bella 104; 小安 73; Ziyi 111; Jay 60.
Map these labels explicitly to authenticated application users. Labels are not proof of Lark identity or authority.
For the 37 duplicate groups with conflicting owners, show all claims and let an authorized reviewer assign one primary owner. Preserve other source assignments in provenance; never use last-row-wins.

## Email and note classification
1. Trim whitespace; strip mailto: when present; retain original value.
2. An ordinary syntactically valid single address becomes an unverified contact candidate.
3. Notes such as Future Round, Ask teammate, country checks, follower comments or dog-only observations become internal notes/proposed tasks, never email addresses.
4. A note with an embedded address yields both a preserved note and an unverified candidate; review the intended creator/agency before activating it.
5. A TikTok redirect with an email encoded in its target may be decoded locally into a candidate. Do not visit a redirect to validate it.
6. Malformed http:// prefixes, leading @ and mixed strings require preview and explicit correction; do not silently rewrite them into recipients.
7. Notes describing future rounds may suggest FOLLOW_UP_LATER, but do not prove a past conversation or set NO_RESPONSE/DECLINED automatically.
Private or subjective notes stay internal and must not leak into creator-facing drafts.

## Follower parsing
Normalize whitespace and K/k=1,000, M/m=1,000,000. Source also uses 万=10,000 and W; interpret W as a proposed 10,000 multiplier only after confirming the import convention.
Examples: 31.6K → 31,600; 1.5万 → 15,000; 10.5W → proposed 105,000.
18,7K is ambiguous locale formatting: suggest 18,700 in preview but require confirmation, not automatic comma removal.
Store raw value, parsed integer, parser version, import time and original observation time=null. Import time is not the metric measurement time.
For duplicates with different counts and no timestamp, retain competing snapshots and mark current count unresolved. Do not take maximum or last row as latest.

## Matching and merge process
- Import batch stores source fingerprint and row number; row numbers identify provenance, not stable people.
- Exact file reimport is idempotent. New exports match canonical social account candidates; preserve URL history because handles can change.
- Strip tracking/language queries only after validating account URL shape and platform.
- Shared agency emails never merge different social identities by themselves.
- Choose an existing creator only after match confidence and conflicts are reviewed. Otherwise stage a candidate.
- No matching row automatically creates a real collaboration or evidence of outreach. Use IMPORTED_REVIEW_PENDING as import-review status; NEW_LEAD is a proposed business stage after triage.
- Field precedence: verified/accepted business facts and manual corrections > approved import updates > raw source observations.
- Keep imported flags separate from agreement, shipping and financial records.

## UI preview and output
Show counts for raw rows, account candidates, duplicates, unresolved owners, direct email candidates, notes and parsing issues.
Per candidate show source rows, conflicts, proposed value and reviewer choice. Support save/resume, rejected rows and a dry-run report.
Commit only approved rows/fields, with batch and actor audit trail. Allow safe rollback of unchanged imported values; later edits create rollback conflicts.
Do not auto-fetch profiles, create contacts in third-party apps, send email or upload raw CSV to Git.

## Acceptance criteria
- 553 rows are accounted for as imported, pending or rejected, with no silent loss.
- Known source normalizations produce 491 account candidates and 55 duplicate groups before manual identity review.
- The 57 non-direct-email cells never become automatic send targets.
- Empty booleans remain unknown; negative labels retain their meaning.
- Conflicting owners/followers never resolve by file order.
- Missing conversation history never becomes CONTACTED/AGREED.
- Reimport does not duplicate candidates or overwrite manual workflow data.
- The raw file remains unchanged; normalization is traceable and reversible.

## Sent-based contact discovery — supersedes enrichment round trip
Jay corrected the workflow on 2026-10-07: do not build a Modash contact-enrichment import loop. Jay sends the initial email directly from the work mailbox; the platform learns recipient addresses from synchronized Sent messages and full threads.
The initial CSV import and its existing email-field classification remain in scope. Missing email stays unknown until a real message or manual confirmation supplies it; it does not block importing a lead.
Remove CONTACT_ENRICHMENT mode and Modash round-trip exports from first-release requirements. A Modash export sample is no longer a dependency for contact discovery.
Link observed recipients to confirmed creators using existing conversation/contact mappings or explicit social identity in message content. Ambiguous names, agencies and multiple recipients enter a manual association queue.
Preserve message ID, source=sent_message, send time and role; never label an address verified solely because mail was sent.
Do not auto-create confirmed creators for unrelated outgoing work mail, merge by agency email or resend outreach after import. Unmatched business conversations may create review candidates.
Import preview still handles the original 57 mixed email cells safely; it does not attempt to discover additional addresses.
