---
target: src/pages/LandingPage.tsx
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-07-22T10-48-17Z
slug: src-pages-landingpage-tsx
---
Method: dual-agent (A: ded3aead-6fc2-4a76-9173-63ea082441e0 · B: 2a6546b9-c633-4ac0-ba5b-2be245b515c4)

### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Buttons have loading states; animations provide scroll feedback |
| 2 | Match System / Real World | 3 | SaaS terminology mixed with overly specific Web3 jargon |
| 3 | User Control and Freedom | 3 | Standard navigation, anchor links, dismissible mobile menu |
| 4 | Consistency and Standards | 4 | Follows established SaaS landing page component structures |
| 5 | Error Prevention | 3 | Clear CTAs, distinct external vs internal links |
| 6 | Recognition Rather Than Recall | 3 | Benefits listed, but disjointed narrative makes it hard to follow |
| 7 | Flexibility and Efficiency | 3 | Sticky nav and clear sections, though logical flow is flawed |
| 8 | Aesthetic and Minimalist Design | 2 | High visual noise: grids, noise, glass effects, orbs, and code blocks |
| 9 | Error Recovery | 3 | Fallback navigation exists |
| 10 | Help and Documentation | 4 | Prominent links to documentation, GitHub, and live demo |
| **Total** | | **31/40** | **Good** |

### Design Specificity Verdict

**"Web3 Template Bingo" with moments of clarity.**
The visual design leans heavily into standard Web3/Crypto SaaS tropes: glowing orbs, noise overlays, glassmorphism, gradient text, and grid patterns. While it attempts to feel high-tech and specific through code snippets and architectural diagrams, it ultimately feels like a generic developer tool template. The domain specificity (Sui object models, Move calls) clashes somewhat with the generic business marketing.

The deterministic CLI scan returned **0** rule violations and the manual review confirms solid structural implementation. There were no false positives to report. 
*Note: Browser overlays were skipped since we used an offline, deterministic scan alongside unanchored AI review.*

### Overall Impression
The page is technically sound and visually impressive, but it suffers from a confused narrative. It tries to sell to both the non-technical CEO (MRR, Churn) and the deep Move developer (shared object architectures) simultaneously, and in the wrong order. The single biggest opportunity is to restructure the narrative flow and clarify the target audience.

### What's Working
- **Extremely Direct Value Proposition**: The Hero headline and Pricing sections don't hide behind marketing fluff. "Zero Chargebacks" and "PayStreamer takes 2.5%" are clear and compelling.
- **Effective Abstract Visualizations**: The "Subscription Demo" in the Hero and the "Shared Object Visualization" in the Security section do an excellent job of visually communicating complex on-chain states without needing walls of text.

### Priority Issues

- **[P1] Backwards Narrative Arc**
  - **Why it matters**: "The Problem" section appears *after* "Integration Flow" and Pricing. The user is instructed on how to integrate before they are convinced why they need it.
  - **Fix**: Reorder the page sections. The Problem (`EndUserExperience`) should come immediately after the Hero, followed by Features, then Integration, then Security, then Pricing.
  - **Suggested command**: `$impeccable layout`

- **[P1] Inconsistent Audience Targeting**
  - **Why it matters**: The copy swings between business operators and technical developers. A non-technical founder will bounce at `account::SubscriptionAccount`, while a developer will be annoyed by inconsistent pseudo-code.
  - **Fix**: Pick a primary audience (likely technical founders/developers) and ensure code snippets are accurate (replace pseudo-code with real SDK calls), while keeping high-level benefits accessible.
  - **Suggested command**: `$impeccable clarify`

- **[P2] Hero CTA Overload**
  - **Why it matters**: Three distinct calls-to-action ("Get Started", "Documentation", "Try a live demo") dilute the primary conversion goal.
  - **Fix**: Reduce to one primary CTA ("Launch App" or "Get Started") and one secondary CTA ("Read Docs"). Move the live demo trigger further down.
  - **Suggested command**: `$impeccable distill`

- **[P2] Misleading Component Naming & Content**
  - **Why it matters**: The `EndUserExperience.tsx` component is titled "The Problem" and discusses *platform operator* pain points, not end-user experience.
  - **Fix**: Rename the component to `TheProblem.tsx` or similar, and ensure the copy correctly identifies who is experiencing the problem.
  - **Suggested command**: `$impeccable clarify`

- **[P3] Visual Clutter**
  - **Why it matters**: Noise overlays, grid patterns, glowing orbs, and glass cards all at once create a visually exhausting experience.
  - **Fix**: Tone down the decorative background elements. Choose either the grid or the noise overlay, not both.
  - **Suggested command**: `$impeccable quieter`

### Persona Red Flags

**Jordan (The Non-Technical Founder / Operator)**: Jordan will bounce when they reach the `SecuritySection` and see a technical diagram labeled `account::SubscriptionAccount` with "Capabilities" and "Shared Objects". They just want to know if it's safe, not how Move contracts manage capabilities.

**Riley (The Web3 Developer)**: Riley will be annoyed by the inconsistency. The `IntegrationFlow` uses fake pseudo-code (`register_platform("My SaaS")`), while `CoreFeatures` uses actual `@mysten/sui` SDK code (`tx.moveCall`). This inconsistency makes the SDK look confusing.

**Casey (The End User)**: While this is a B2B page, if Casey stumbles here to see who is processing their payments, they will find zero reassurance. The section called "End User Experience" is actually just a list of merchant complaints.

### Minor Observations
- The `CoreFeatures.tsx` file uses hardcoded hex colors (`text-[#ec4899]`, `text-[#ef4444]`) in its icons, breaking the semantic token system (`text-accent-success`, `text-accent-primary`) used elsewhere.
- The `IntegrationFlow` uses a nice `margin: "-50px"` for its framer-motion viewport trigger, ensuring animations start at the right scroll depth.

### Questions to Consider
- If the biggest selling point is "Zero Chargebacks" and "No Accidental Churn", why do we wait until the 5th section of the page to actually explain the problem?
- Are we selling to the CEO who cares about MRR, or the Developer who cares about Move composability?
- Why is the section named `EndUserExperience` entirely filled with platform operator complaints?
