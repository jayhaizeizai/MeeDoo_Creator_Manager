# Creator Manager UI Specification
Version 0.1 — 2026-10-07. Reference: supplied image.png, 1532 × 1318 screenshot of MeeDoo video analytics dashboard.
The screenshot has been visually inspected. Dimensions and colors below are implementation estimates, not recovered CSS. No source code or font metadata was provided.

## Observed visual language
- White full-height sidebar roughly 223 px wide, separated by a fine cool-gray border.
- MeeDoo logo at upper left: rounded purple monogram tile with soft shadow, dark wordmark and a small subtitle.
- Sidebar has bold group headings, muted icons/text and a pale lavender rounded active row with vivid purple text.
- Bottom profile block has an avatar, name, Lark workspace label and a small action button.
- White top bar about 64 px high; small green sync dot/time on left, notification and language controls on right.
- Main canvas is a very light gray-lavender, with roughly 56 px horizontal padding at this viewport.
- Header combines small uppercase eyebrow, large dark title, muted explanatory line and right-aligned period/sync controls.
- Thin lavender informational strip; compact segmented tabs on a light gray-lavender track.
- Large white bordered chart card, then two-column metric cards; rounded corners roughly 16–18 px.
- Dark headings, muted blue-gray secondary text, purple data line and platform-specific color/icon accents.

## Proposed tokens
| Token | Starting value | Role |
| --- | --- | --- |
| primary | #6C55F5 | Primary action, active nav, selected controls |
| primary-soft | #F0EDFF | Selected backgrounds and badges |
| canvas | #F7F8FC | Main background |
| surface | #FFFFFF | Sidebar, header and cards |
| text-primary | #15213B | Titles and body emphasis |
| text-secondary | #7D8BA7 | Supporting text; verify contrast before implementation |
| border | #E4E8F2 | Card and control outlines |
| success / warning / error | semantic accessible palette | Always paired with labels/icons |
| radius | 10 px controls; 16 px cards | Consistent geometry |
| spacing | 4, 8, 12, 16, 24, 32, 48 px | Component rhythm |
| typography | system sans-serif with Chinese fallback | Match density; do not claim exact source font |

Maintain sufficient contrast rather than copying faint source text literally. Font sizes: body/control 14–16 px, section title 18–20 px, page title 28–32 px; validate against actual implementation.

## Product adaptation
Keep the observed MeeDoo shell; replace video-production navigation with creator operations:
- Daily work: Agent Inbox, Dashboard.
- Partnerships: Creators, Pipeline, Agreements.
- Delivery: Shipping, Content.
- Administration: Knowledge, Settings.
Navigation group names are proposed. Default entry remains Agent Inbox.
The reference uses Chinese navigation and an English language control. Adopt Chinese internal UI initially with English toggle as a proposed preference; Creator-facing forms/emails remain English. Full internal localization priority needs confirmation.

## Page composition
### Agent Inbox
Header with sync status and queue counts. Segmented queues: Drafts Ready, Needs Decision, Waiting, Errors.
Desktop three-pane arrangement: queue list, full thread, draft/decision panel. At narrower widths open the review pane as a drawer.
Display recipient identity, owner, last message direction/time, suggested action and explicit risk label.
Draft actions: Approve & Send, Edit, Ask Agent, Dismiss. Show attachments and source evidence before approval.
Stale/blocked drafts show the precise blocker; no active Send button while unsafe to send.

### Creators and detail
Dense searchable table, sticky header and configurable columns; avoid showing every legacy CSV flag by default.
Default columns: identity/handle, owner, stage, next action, priority, contact availability, follower count with source freshness.
Saved filters and Needs Action sit above the table. Sensitive/internal qualification notes are not exposed in outward communications.
Detail uses tabs for overview, conversation, collaborations, agreements, shipping, content and activity, with persistent identity/owner context.

### Pipeline
Cards show creator, collaboration, owner, next action and blockers. Stage moves require server validation; show why a move fails.
No visual drag operation can imply contract acceptance or sending an email.

### Agreements / Clickwrap
Internal table: creator, level, version, status, issued/accepted time and evidence access.
Creator page: restrained MeeDoo branding, plain-language material terms summary, full terms/download, unchecked explicit consent and a clear final action.
Mobile layout single-column. Summary never hides full rights/payment terms. Expired/replaced links explain the state; receipt page shows actual accepted version.

### Shipping / Content / Dashboard
Shipping uses a compact table with gate checklist and shipment detail drawer.
Content shows deliverable completeness and versioned review actions; honest feedback remains visible.
Dashboard begins with actionable queues, followed by funnel and operational metrics in the source screenshot's card system.
Do not copy video follower-growth or retention charts merely because they appear in the reference. Platform accent colors label relevant channels, not risk.

### CSV import review
Stepper: file → mapping → validation/matches → conflict review → confirmation → report.
Use warning counts for 55 duplicate groups, owner conflicts and mixed email cells from the current batch. Counts are calculated per batch, not hard-coded.
Side-by-side source/proposed values, explicit keep/replace/review actions, and tri-state rendering for blank flags.

## Responsive and state requirements
Desktop: fixed sidebar, flexible content; collapse sidebar on tablet; Creator pages work at narrow mobile widths.
Support keyboard focus, labels, text risk indicators and announced form errors.
Every surface includes loading, no data, filtered-empty, error, no access and stale-data states.
Long emails, URLs and translated labels must not overlap buttons. Unsaved drafts survive recoverable network errors.
Only render verified live metrics as numbers; unavailable integration data is labeled Not connected/Unknown.

## UI acceptance
- Shell visibly matches the white-sidebar/purple/lavender/card composition of the supplied screenshot.
- Core work is reachable without using analytics as the first screen.
- All important state changes have visible confirmation and audit context.
- CSV import exposes mixed notes and duplicates before committing.
- Mobile users can read full terms and accept without horizontal scrolling.
- Screenshot is a visual reference, not authorization to duplicate unrelated video-management features.
