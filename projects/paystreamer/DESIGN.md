---
name: PayStreamer Design System
description: Web3-native, trustless subscription payment protocol built on Sui.
colors:
  bg-primary: "#0a0a0f"
  bg-secondary: "#12121a"
  accent-primary: "#6c63ff"
  accent-secondary: "#3b82f6"
  accent-success: "#10b981"
  accent-warning: "#f59e0b"
  text-primary: "#ffffff"
  text-secondary: "#94a3b8"
  border-glass: "rgba(255, 255, 255, 0.1)"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 5vw, 4rem)"
    fontWeight: 700
    lineHeight: 1.1
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
rounded:
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
spacing:
  xs: "0.5rem"
  sm: "1rem"
  md: "1.5rem"
  lg: "2rem"
  xl: "3rem"
components:
  button-gradient:
    backgroundColor: "{colors.accent-primary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
  card-glass:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.2xl}"
    padding: "24px"
---

# Design System: PayStreamer

## Overview

**Creative North Star: "The Neon Treasury"**

PayStreamer combines high-performance Web3 architecture with sleek, high-contrast dark visual aesthetics. It communicates cryptographic safety and predictable cashflow for SaaS platforms operating on the Sui blockchain.

**Key Characteristics:**
- High-contrast dark backgrounds with neon violet and blue accent gradients.
- Translucent glassmorphism (`backdrop-filter: blur(20px)`) for cards and elevated panels.
- JetBrains Mono typography for code snippets, object IDs, and monetary balances.
- Subtle background noise textures and glowing ambient motion orbs.

## Colors

The palette uses deep obsidian backgrounds paired with vivid neon accents to express security, speed, and modern financial infrastructure.

### Primary Accent
- **Electric Violet** (#6c63ff): Used for primary calls-to-action, active navigational states, and primary brand accents.

### Secondary Accent
- **Sui Cyan-Blue** (#3b82f6): Used for secondary buttons, interactive highlights, and multi-color gradient text.

### Utility & Status Colors
- **Emerald Settlement** (#10b981): Used for active transaction confirmations, positive balance indicators, and success states.
- **Amber Caution** (#f59e0b): Used for pending withdrawal warnings and spend limits.

### Neutral Colors
- **Obsidian Core** (#0a0a0f): Primary background surface color.
- **Deep Velvet** (#12121a): Secondary card and panel surface color.
- **Slate Text** (#94a3b8): Secondary text and metadata color.
- **Pure White** (#ffffff): Primary headline and high-contrast text color.

### Named Rules
**The Gradient Voice Rule.** Primary headlines and brand highlights use a 135deg gradient from Electric Violet (#6c63ff) to Sui Cyan-Blue (#3b82f6).

## Typography

**Display & Body Font:** `Inter`, system-ui, sans-serif
**Monospace / Data Font:** `JetBrains Mono`, monospace

### Hierarchy
- **Display** (700, clamp(2.5rem, 5vw, 4rem), 1.1): Main hero headers and section titles.
- **Headline** (700, 1.875rem, 1.2): Card headers and feature callouts.
- **Body** (400, 1rem, 1.6): Standard paragraph copy and descriptions.
- **Label / Code** (JetBrains Mono 500, 0.875rem, 1.4): Hashes, Move calls, balances, and numerical tables.

## Layout

A responsive 12-column grid layout with generous vertical section padding (py-24 to py-32). Maximum container width is constrained to `7xl` (1280px). Card grids automatically reflow from 1 column on mobile to 2 or 3 columns on desktop.

## Elevation & Depth

PayStreamer uses **tonal layering and glassmorphism** rather than traditional drop shadows.

### Depth Vocabulary
- **Surface Level 0**: Flat Obsidian background (`#0a0a0f`) with subtle grid overlay.
- **Surface Level 1 (Glass Card)**: `rgba(18, 18, 26, 0.8)` with `backdrop-filter: blur(20px)` and a subtle `1px solid rgba(255, 255, 255, 0.1)` border.
- **Hover Elevation**: On hover, glass cards lift slightly (`translateY(-4px)`), brighten their borders (`rgba(108, 99, 255, 0.5)`), and emit a soft glowing shadow (`0 0 40px rgba(108, 99, 255, 0.25)`).

## Shapes

- **Cards**: 16px corner radius (`rounded-2xl`).
- **Buttons**: 8px to 12px corner radius (`rounded-lg` / `rounded-xl`).
- **Badges & Pills**: Full pill capsule radius (`rounded-full`).

## Components

### Buttons
- **Gradient Primary**: Vibrant gradient background from `#6c63ff` to `#3b82f6`, white text, soft glow on hover.
- **Outline Secondary**: Translucent dark fill with `border-white/20`, white text, hover background transition.

### Glass Cards
- Translucent backdrop blur, subtle inner highlight ring, 16px radius, hover glow.

### Code Snippets
- JetBrains Mono text inside dark container (`bg-black/40`), border `rgba(255, 255, 255, 0.1)`, emerald text highlighting.

## Do's and Don'ts

### Do:
- **Do** use semantic CSS variables (`var(--accent-primary)`) rather than hardcoded hex values.
- **Do** use `JetBrains Mono` for any financial amounts, object IDs, or Move smart contract code snippets.
- **Do** support `prefers-reduced-motion` for all background orb float animations.

### Don't:
- **Don't** use solid white backgrounds for cards; always maintain translucent dark glass aesthetic in dark mode.
- **Don't** use generic blue/red alert colors outside the defined palette (`#6c63ff`, `#3b82f6`, `#10b981`, `#f59e0b`).
