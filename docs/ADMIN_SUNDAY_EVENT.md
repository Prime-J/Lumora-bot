# 🕊️ LUMORA — SUNDAY BIBLE QUESTION EVENT (ADMIN MANUAL)

> **This is a permanent weekly event, not a gift drop.**
> Players earn rewards by answering biblical questions correctly.
> **Public explainer lives at the bottom of this file** — copy it into `.help sunday` when the feature ships.

---

## 1. Event identity

| Field | Value |
|---|---|
| **Name** | The Sunday Bible Question Event |
| **Type** | Permanent recurring weekly event |
| **Window** | Every Sunday, 00:00 CAT → 24 hours |
| **Public command** | `.sunday` (start a run), `.sunday-lb` (standings) |
| **Admin / owner source of truth** | Owner Sunday module (proposed: `systems/sunday-bible.js` or the owner Sunday command handler) |
| **AI provider** | OpenRouter-compatible model via `OPENROUTER_API_KEY` (or the provider the bot already uses). Falls back to a curated bank if AI is unavailable. |

---

## 2. What happens, in plain terms

1. **Every Sunday at 00:00 CAT**, the event opens for 24 hours.
2. During that window, each player can take **one Sunday run**.
3. The player **chooses how many questions to answer**, from **4 to 10**.
4. The bot asks **biblical questions** one at a time with **A / B / C / D clickable buttons**.
5. The player taps an answer. The bot replies instantly whether it was correct, then continues.
6. A run ends when:
   - the player finishes the chosen number of questions, **or**
   - the player gets too many wrong answers (strike limit).
7. On completion the bot sends a result card with:
   - a performance summary (questions answered, correct, incorrect),
   - **Lucons** earned for correct answers,
   - **XP** earned,
   - **a reward for completing the run**,
   - **a stronger reward for doing well**,
   - **a top reward for a perfect run**.

The core idea: rewards are **earned by answering correctly**, not handed out for turning up.

---

## 3. Participation flow (player-side, step by step)

### Step 1 — Enter the event
- Player sends `.sunday` while the Sunday window is open.
- If the window is closed, the bot tells the player when the next Sunday opens and what time that is.

### Step 2 — Pick the question count
- Bot asks: *How many questions this run?*
- Player picks from **4–10** using **clickable buttons**, not raw text.
- Choosing more questions raises the potential reward, but also raises exposure to strikes.

### Step 3 — Answer questions
- One biblical question at a time.
- Each question ships with **A / B / C / D** native buttons.
- Player taps the answer.
- Bot replies immediately: correct or incorrect, with a short line of context if useful.
- Wrong answers count toward the strike limit.

### Step 4 — Run ends
- If the player completes the chosen count, the run ends successfully.
- If the player hits the strike limit, the run ends early as a fail.
- On either end, bot sends the **result card**.
- The bot also records the result for that week's standings (`.sunday-lb`).

---

## 4. Reward model (earned-by-correctness)

### Core rule
- Rewards come from **how many questions were answered correctly**.
- Just entering the event does **not** grant the full reward.
- Partial correctness should still earn something, so a failed run is not a dead run.

### Reward ingredients
- **Lucons** — earned for correct answers. More correct answers → more Lucons.
- **XP** — earned for completing the run.
- **Completion reward** — awarded for finishing the chosen question count, even if not perfect.
- **Performance reward** — stronger reward for higher accuracy.
- **Perfect-run reward** — best reward for answering every chosen question correctly.

### Reward behavior you should define
- **Base Lucons per correct answer** — the starting unit.
- **Accuracy scaling** — whether reward grows linearly, step-wise, or with a bonus multiplier.
- **Fail handling** — how much a partial run still earns; whether a fully failed run earns nothing or a small consolation.
- **Perfect-run reward** — what extra reward appears only when every answered question is correct.
- **Random reward** — one reward that is randomly chosen from a pool so it is not always the same.

### Example structure (illustrative — tune to your economy)
- 4 questions, 4 correct → small Lucon reward + XP + completion reward.
- 7 questions, 6 correct → larger Lucon reward + XP + completion reward + performance reward.
- 10 questions, 10 correct → max Lucon reward + XP + completion reward + performance reward + perfect-run reward + random reward.

The important point: **the more you answer correctly, the more you earn.**

---

## 5. Question generation (AI side)

### When generation happens
- **Every Sunday starting at 00:00 CAT**, a fresh pool of biblical questions is generated for that 24h window.
- After 24 hours, the window closes and the next Sunday gets a new pool.

### What the AI should produce
- A **set of Bible-knowledge questions** with plausible distractors.
- A **spread of question types**:
  - factual Bible knowledge: people, places, events, mountains, who said what;
  - verse-based: complete-the-verse, identify-the-verse, what does this verse say;
  - thematic: what happened at this place, which mountain did Moses die on, etc.
- Enough questions to support the max player choice, so the pool should be larger than the max single-run count.

### Example question themes the AI can draw from
- *Which mountain did Moses die on?*
- *Where was Jesus born?*
- *Who disowned Christ three times?*
- *Complete the verse: “For God so loved ___”*
- *Which prophet was taken up in a chariot of fire?*
- *What happened at the Mount of Transfiguration?*

### Reliability / fallback
- If the AI provider is unavailable or returns junk, **fall back to a curated bank** so Sunday still runs.
- Consider pre-generating the pool on Saturday so Sunday is always ready.
- Keep an owner review path so bad questions can be caught before they award rewards.

---

## 6. Owner commands (admin / Sunday event alterations)

> These are **owner/admin commands**. Do not expose them to regular players.

### Inspect / status
| Command | Who | What it does |
|---|---|---|
| `.su-status` | Owner | Shows whether the Sunday window is open, when it opened, when it closes, and whether the current pool exists. |
| `.su-next` | Owner | Shows when the next Sunday window opens and whether next week's pool is pre-generated. |

### Pool control
| Command | Who | What it does |
|---|---|---|
| `.su-regenerate` | Owner | Forces regeneration of the current Sunday's question pool. |
| `.su-pool` | Owner | Shows the current pool/questions or a summary for review. |
| `.su-pool-test` | Owner | Runs a private test run through the current pool without awarding anything. |

### Rule alterations (current cycle)
| Command | Who | What it does |
|---|---|---|
| `.su-set-range <min> <max>` | Owner | Sets the allowed question-count range (default 4–10). |
| `.su-set-strikes <n>` | Owner | Sets the strike limit (default 6). |
| `.su-set-lucons <curve>` | Owner | Adjusts the Lucon reward curve for correct answers. |
| `.su-set-perfect-reward <reward>` | Owner | Changes the perfect-run reward. |
| `.su-set-random-pool <pool>` | Owner | Replaces the random reward pool. |
| `.su-set-ai <provider/prompt tweaks>` | Owner | Adjusts AI provider settings or the generation prompt for the week. |
| `.su-set-fallback <bank>` | Owner | Updates the curated fallback bank. |

### Audit / standings
| Command | Who | What it does |
|---|---|---|
| `.su-lb` | Owner | Owner-level view of the week's results and standings. |
| `.su-audit` | Owner | Audit log of generation, fallback usage, and any reward anomalies for the week. |

### Operational
| Command | Who | What it does |
|---|---|---|
| `.su-open` | Owner | Manually open the Sunday window early (if needed). |
| `.su-close` | Owner | Manually close the current Sunday window. |
| `.su-disable` | Owner | Temporarily disable the event for maintenance. |
| `.su-enable` | Owner | Re-enable the event. |

---

## 7. Native button placement (UI notes)

The Sunday event should use **native clickable buttons throughout**, consistent with the rest of the bot.

- **`.sunday`** → buttons for *pick your question count* (4–10).
- **Each question** → **A / B / C / D** buttons.
- **Result replies** → keep quick text; if there is a continue/claim step, put it on a button.
- **Completion card** → put any follow-up action on a button, not raw text input.

Do not make players type `A`, `B`, `C`, `D` or the question number when buttons are available.

---

## 8. Important behavioral rules

- **One window per week.** Run availability is tied to the Sunday 00:00 CAT → 24h window.
- **One run per player per window** unless you deliberately allow retries.
- **Player chooses count from 4–10.** Do not force a fixed count on the player.
- **Strike limit ends the run.** If a player fails, the run ends after the allowed number of wrong answers.
- **Rewards track correctness.** More correct answers → more reward; perfect run → top reward.
- **Random reward changes** so the event does not become farmable for one fixed prize.
- **Fallback must exist** so the event still runs when AI is unavailable.

---

## 9. What still needs locking before this is "all-round good"

- [ ] Exact reward curve: Lucons per correct answer, accuracy scaling, fail consolation, perfect-run reward.
- [ ] Exact strike limit and whether a failed run still earns anything.
- [ ] Whether a player gets one run per window or can retry.
- [ ] Curated fallback bank of biblical questions.
- [ ] Random reward pool.
- [ ] Which Epic Mora / content rewards can appear as the random reward, if any.
- [ ] AI provider and env key.
- [ ] Owner command names and where they are wired.
- [ ] Public help text and visible window timing for players.

---

# 📖 PUBLIC EXPLAINER — copy into `.help sunday`

## 🕊️ The Sunday Bible Question Event — a weekly Bible knowledge challenge

A permanent weekly event. Every **Sunday from 00:00 CAT for 24 hours**, you can take a run.

### How to join
1. Send `.sunday` during the Sunday window.
2. Pick how many questions you want — **4 to 10**.
3. Answer one biblical question at a time using the **A / B / C / D buttons**.
4. You get a limited number of wrong answers — after that the run ends.

### What you earn
- **Lucons** — earned for correct answers. The more you answer correctly, the more you earn.
- **XP**.
- **A completion reward** for finishing your chosen question count.
- **A stronger reward** if you do well.
- **A top reward** if you get a perfect run.
- **A random reward** that changes so it is not always the same.

### When it is available
- Every Sunday, 00:00 CAT → 24 hours.
- If you miss a Sunday, the next one opens the following week.

### Tips
- More questions can mean more reward, but also more exposure to wrong answers.
- The questions are generated fresh every Sunday, so the pool changes each week.
- Use the buttons — do not type the answer letter.

---

*Owner manual for the permanent Sunday Bible Question Event.*
*Keep this in sync with `docs/EVENTS.md` event 005 and with the owner command implementation.*
