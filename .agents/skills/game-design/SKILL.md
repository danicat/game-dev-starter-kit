---
name: game-design
description: >-
  Use this skill when guiding the user through game concept design, defining core mechanics, conducting interactive game design interviews (/grill-me), or generating a Game Design Document (GDD.md) for 2D games.
---

# Game Design & Interactive GDD Creation Guide (Game Designer Role)

This skill equips AI agents acting in the **Game Designer Role** with structured interview protocols, probing frameworks, and templates to guide users from initial game ideas to a production-ready **Game Design Document (`GDD.md`)**.

---

## 1. Game Designer Role & Interactive Probing Protocol

The **Game Designer Agent** aligns the user's vision before code or assets are generated:
1. **Interactive Interview Protocol (`/grill-me`)**: When starting a new game project or refining an idea, activate the `/grill-me` interview workflow (or use targeted, one-at-a-time probing questions) to systematically explore each branch of the game design tree.
2. **Provide Recommended Answers**: For every probing question, offer a concrete, expert recommendation tailored to 2D Ebitengine games (e.g., *"Recommendation: 16:9 canvas at 320x180 virtual resolution for retro pixel scaling"*).
3. **Resolve Dependencies One-by-One**: Resolve core loop decisions before asking about art styles, and resolve mechanics before asking about music.
4. **Produce Authoritative `GDD.md`**: Summarize all agreed decisions into a structured `GDD.md` saved in the workspace root.

---

## 2. Interactive Interview Branching Tree (`/grill-me` Workflow)

Follow this sequential branching tree when interviewing the user:

```text
Branch 1: Core Concept & Elevator Pitch
  ├── What is the 1-sentence hook / elevator pitch?
  └── What classic game(s) serve as primary inspiration?

Branch 2: Gameplay Loop & Mechanics
  ├── What is the primary action cycle? (Action -> Challenge -> Reward)
  ├── What are the exact win and loss conditions?
  └── What hazards, enemies, or time pressures exist?

Branch 3: Controls & Input Mapping
  ├── What input devices are supported? (Keyboard / Gamepad / Mouse / Touch)
  └── What are the primary action buttons?

Branch 4: Visual Art & Graphic Strategy
  ├── What is the target visual aesthetic? (Retro Pixel / Cyberpunk / Minimalist Vector)
  └── Pure-code procedural graphics (procedural-art) vs. Gemini AI assets (nano-banana)?

Branch 5: Audio & Soundscape Strategy
  ├── High-fidelity CD music (lyria) vs. Pure-code DSP chiptunes (procedural-composer)?
  └── What sound effects (SFX) are required for gameplay feedback?

Branch 6: Game States & HUD Layout
  ├── What HUD metrics are displayed on screen? (Score, Health, Timer, Ammo)
  └── Is a server-side high score leaderboard needed on Cloud Run?
```

---

## 3. Template & Technical Standards

For the complete, production-grade Game Design Document template, consult:

| Module | Reference File | Key Topics Covered |
| :--- | :--- | :--- |
| **GDD Template** | [`references/gdd_template.md`](references/gdd_template.md) | Standard 7-section markdown template covering elevator pitch, mechanics, controls, art strategy, audio strategy, state flow, and Ebitengine architecture notes. |

---

## 4. Probing Question Templates with Recommendations

Use these interview question templates during the `/grill-me` session:

### Question 1: Core Loop & Hook
> *"What is the core 1-sentence pitch for your game, and what is the main mechanic?"*  
> **Recommendation**: *"Focus on a single, highly satisfying primary mechanic (e.g., 'A top-down arcade shooter where shooting pushes your ship backward, using recoil as your primary movement mechanism')."*

### Question 2: Win / Loss Conditions
> *"How does the player win a round, and what causes a Game Over?"*  
> **Recommendation**: *"Keep game jam rounds short (1–3 minutes per run). Loss occurs when health hits 0 or time runs out; victory occurs after surviving 3 enemy waves or achieving a target score."*

### Question 3: Visual Asset Strategy
> *"Do you prefer pure-code procedural graphics (vector shapes, particle FX) or AI-generated pixel art sprites?"*  
> **Recommendation**: *"Use `procedural-art` for instant zero-dependency UI/particle effects, and `nano-banana` for generating 32x32 character sprite sheets."*

### Question 4: Audio Strategy
> *"Should the game feature high-fidelity CD-quality background music or retro chiptune audio?"*  
> **Recommendation**: *"Use `lyria` to generate an atmospheric 30-second music loop, and `procedural-composer` to generate instant 8-bit sound effects (laser, jump, coin pick-up)."*

---

## 5. GDD Generation Checklist

Before handing off the generated `GDD.md` to technical skills (`ebitengineer`, `procedural-art`, `nano-banana`, `lyria`, `procedural-composer`):

- [ ] **Elevator Pitch Defined**: Clear 1-sentence hook established.
- [ ] **Core Loop Explicit**: Player actions, challenges, and rewards mapped out.
- [ ] **Win/Loss Conditions Clear**: Quantitative triggers set for victory and defeat.
- [ ] **Controls Mapped**: Actions bound across Keyboard, Gamepad, and Touch.
- [ ] **Asset Strategy Assigned**: Graphics assigned to `procedural-art` or `nano-banana`; Audio assigned to `lyria` or `procedural-composer`.
- [ ] **Saved to Disk**: Document committed as `GDD.md` in workspace root.
