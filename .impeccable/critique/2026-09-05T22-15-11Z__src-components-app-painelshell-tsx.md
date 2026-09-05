---
target: navegação mobile (PainelShell, AppShell mobile Sheet, /painel, menu-mobile-papel)
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:C:\\users\\evandro\\projetos\\lojaperfeicao\\src\\components\\app\\PainelShell.tsx"
target_fingerprint: "sha256:d6b5f0f7fd50d4bee155df2690a4a65f8871a8e682b757abdcf380dd765c25ff"
target_path: "C:\\users\\evandro\\projetos\\lojaperfeicao\\src\\components\\app\\PainelShell.tsx"
timestamp: 2026-09-05T22-15-11Z
slug: src-components-app-painelshell-tsx
---
Method: dual-agent (A: general-purpose design-review agent · B: general-purpose detector/browser-evidence agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Unread badges work well; admin config screen never warns which selections will be no-ops |
| 2 | Match System / Real World | 3 | Masonic terminology and icons are appropriate for the domain |
| 3 | User Control and Freedom | 2 | No undo/preview in menu-mobile.tsx; the affected member has zero control over admin's changes to their own nav |
| 4 | Consistency and Standards | 1 | Home grid is now per-category colored; tab bar and drawer two screens away stay monochrome for the *same* items |
| 5 | Error Prevention | 1 | Saving an empty or out-of-scope item list for a role has no confirmation or warning |
| 6 | Recognition Rather Than Recall | 1 | "Frequência" silently vanished from its habitual 3rd tab slot with no announcement |
| 7 | Flexibility and Efficiency | 3 | Three-layer personalization (org-wide hide, personal hide/favorite, role lock) is genuinely powerful for admins |
| 8 | Aesthetic and Minimalist Design | 2 | 11 ungrouped tiles in a 4-col grid on `/painel` contradicts the product's own "legibility over density" principle |
| 9 | Error Recovery | 2 | Empty-state copy in menu-mobile.tsx is good; no equivalent exists on the member-facing side |
| 10 | Help and Documentation | 1 | No onboarding, tooltip, or change notice anywhere in the flow |
| **Total** | | **18/40** | **Poor — major UX rework needed before this ships to the real 60+ audience** |

## Design Specificity Verdict

**LLM assessment**: Still reads as a generic B2B admin mobile nav with a color patch applied to one screen. The one genuinely audience-specific move (tab-bar size bump) is real, but the color-coding introduced on `/painel/index.tsx` was never extended to `PainelShell.tsx`'s tab bar or drawer, so the system now speaks two visual dialects for the same items — a tell that this was a sequence of independent point-fixes in one session, not one design language authored for a 60+, low-tech-literacy Masonic-lodge audience end to end.

**Deterministic scan**: `detect.mjs --json` on all 4 files returned `[]`, exit code 0 — zero automated findings. This is a design-heuristics problem, not a lint/pattern-detector-catchable one; nothing here is a false positive because nothing fired.

**Visual overlays**: Not applicable — this is a live production site, not a local dev server, so `detect.js` injection/`live-server.mjs` were correctly skipped per the skill's own rule. No user-visible overlay exists; do not expect one in your browser.

## Overall Impression

The bones are solid — the layered personalization model (loja-wide hide → personal hide/favorite → role lock) is clean and well-commented, and the up/down reorder UI is a sound, accessible choice over drag-and-drop. But five independent tweaks landed in one session (admin-configurable nav, bigger tabs, Frequência demoted, colored home tiles, global overflow fix) without a pass to make them cohere, and the result now actively contradicts itself in the one place — icon color — that a 60+ user relies on most for fast recognition. Score: 18/40 (Poor band). That's not a verdict on any single change; it's what happens when several good ideas ship without a synthesis pass.

## What's Working

- **Layered filtering logic** (`resolverItensMobileIrmao` in `PainelShell.tsx:70-90`, and the equivalent block in `AppShell.tsx:919-952`): precedence between org-wide hidden, personal hidden/favorited, and role-locked items is clear, documented inline, and has no permission conflicts.
- **Unread-count badges** (`PainelShell.tsx:143-145, 182-186`): small red dot + "9+" cap, no jargon, exactly the right amount of signal for this audience.
- **Up/down reorder buttons instead of drag-and-drop** in `menu-mobile.tsx`: a deliberately simpler, more accessible pattern than drag-and-drop for an admin who may not be a power user either.
- **Zero automated defects** (Assessment B): the 4 files are clean of pattern-detectable issues and threw no console errors on either reachable live page.

## Priority Issues

**[P0] "Frequência" silently disappeared from its habitual tab position.**
Why it matters: for a 60+ audience with motor habit and low tolerance for things "disappearing," this reads as the app breaking, not as a redesign — and attendance/frequência is plausibly something members check often.
Fix: a one-time banner/coach-mark on first load after a config change ("Frequência agora está no menu ☰"), or gate role-nav changes behind a mechanism that always surfaces what moved.
Suggested command: `/impeccable onboard`

**[P0] Color is inconsistent between the `/painel` home grid and the tab bar / drawer.**
Why it matters: breaks heuristic #4 (Consistency) in the single highest-traffic flow for the most confusion-prone audience segment; the *same* "Frequência" item is blue on one screen and plain white/gray two taps away.
Fix: either extend the category tint to the tab bar and drawer icons, or revert the home grid to the same monochrome-plus-active-accent vocabulary used everywhere else.
Suggested command: `/impeccable colorize`

**[P1] The admin config picker (`menu-mobile.tsx`) exposes the entire 63-route, 7-group system catalog, unfiltered by role.**
Why it matters: to configure the "irmão" role, the admin must scroll past 22 Tesouraria items and 12 Contabilidade items — completely irrelevant to a member's nav — before reaching the one relevant group, and nothing warns that picking an out-of-scope item is a silent no-op.
Fix: filter/prioritize the picker to items actually eligible for the selected role; visually de-emphasize or hide the rest; add inline warning for no-effect picks.
Suggested command: `/impeccable distill`

**[P1] 11 ungrouped tiles in a `grid-cols-4` layout on `/painel` violates the project's own chunking rule.**
Why it matters: directly contradicts Product Principle #5 ("legibilidade e simplicidade... antes de densidade") and regresses a lesson already applied elsewhere in the same codebase (`AppShell.tsx`'s `chunkBySection`, built specifically to avoid dense unlabeled groups).
Fix: cluster into 2-3 labeled groups (e.g. "Frequente" vs "Institucional") or reduce visible density with progressive disclosure.
Suggested command: `/impeccable layout`

**[P1] Reorder buttons on the admin config screen measure under the 44×44 accessibility minimum.**
Why it matters: Assessment B measured the up/down `Button` (`size="icon"`) at 24×24px below the 640px breakpoint and 36×36px above it (component default `sm:h-9 sm:w-9` vs. the page's own `h-6 w-6` override) — neither reaches 44×44, and this is the primary interaction for reordering a role's entire mobile nav.
Fix: bump the icon-button size variant used here to at least 44×44 regardless of breakpoint, or increase the row's hit-slop.
Suggested command: `/impeccable adapt`

**[P2] No guard against saving an empty or near-empty item list for a role.**
Why it matters: one "uncheck everything → Salvar" reduces a role's entire mobile nav to just "Início" with zero confirmation, silently affecting every user with that role.
Fix: require explicit confirmation below a minimum item count, or on empty save.
Suggested command: `/impeccable harden`

## Persona Red Flags

**Dona Marizete, 68, aposentada, usa WhatsApp só com a família, desconfia de apps novos:**
- Toca onde "Frequência" costumava estar (3ª posição da tab bar) and lands on "Comunicações" instead, with no warning (`PainelShell.tsx:120-124`) — reads as the app breaking.
- On the home screen she sees 11 colored icons, but that color vocabulary never repeats in the tab bar/drawer she already knows, so she can't connect them as "the same" Frequência (`painel/index.tsx:52-56` vs `PainelShell.tsx:56-57`).
- The red "Segurança" tile next to the amber "Legislação" tile can read as an alert/urgency signal rather than an account shortcut (`painel/index.tsx:99-104`).

**Comendador Ricardo, 45, tesoureiro voluntário, uses AppShell's mobile Sheet during meetings:**
- If the lodge admin misconfigures the "tesoureiro" role in the unfiltered 63-item picker, a report he relies on every meeting can vanish from the drawer with zero explanation available to him — he has no access to the config screen to understand why.
- If the admin accidentally saves a near-empty list for "tesoureiro" (no confirmation gate), his drawer empties out mid-accountability-report.

## Minor Observations

- Label drift: header uses "Segurança da conta" (`PainelShell.tsx:46`) while the home tile says just "Segurança" (`painel/index.tsx:101`) for the same destination.
- `overflow-x: hidden` on `html`/`body` (`src/styles.css:235-253`) is confirmed holding at desktop width (Assessment B), but the actual overflowing element was never isolated, and mobile-width behavior could not be verified live in this environment (viewport-narrowing failed 3/3 attempts) — treat as an open verification gap, not a closed fix.
- `CANDIDATOS_MOBILE_IRMAO` (`PainelShell.tsx:55-67`) and `TILES` (`painel/index.tsx:38-105`) are two hand-maintained lists with different ordering and slightly different membership (Segurança only in one, Chamados only in the other) — desync risk going forward.
- Zero console errors on either live page reached (Assessment B) — no functional regressions detected, this is purely a design-coherence problem.

## Questions to Consider

1. If "simplicity over density" is a stated product principle for irmãos, why does the one screen that shapes that experience (`menu-mobile.tsx`) show the entire system catalog — Contabilidade and Tesouraria included — with zero curation?
2. With three personalization layers now stacked, has anyone validated the *resulting* screen with a real 60+ user, or did validation stop at `tsc`/`eslint`/`vite build`, none of which can catch any finding in this report?
3. Was demoting "Frequência" out of the tab bar based on any usage signal, or was it a one-off request applied without checking whether checking attendance is actually one of this audience's most frequent tasks?
