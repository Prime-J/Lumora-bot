# 👑 LUMORA — ADMIN TOKENS MANUAL

### *The Council of Lumora — Proof of Work, Proof of Worth*

---

> *"I built Lumora with my own hands — and I need warriors who carry it forward, not passengers."*
> — Prime, Father of Lumora

---

## TABLE OF CONTENTS

1. [What Admin Tokens Are](#what-admin-tokens-are)
2. [The Hierarchy](#the-hierarchy)
3. [How Tasks Work](#how-tasks-work)
4. [Claiming & Clearing](#claiming--clearing)
5. [Token Grants](#token-grants)
6. [Admin Names](#admin-names)
7. [The Cycle — Rise or Fall](#the-cycle--rise-or-fall)
8. [The Token Shop](#the-token-shop)
9. [Leaderboard](#leaderboard)
10. [Quick Reference](#quick-reference)

---

## WHAT ADMIN TOKENS ARE

Admin tokens (🪙) are the Council's **proof of work**. Every task completed for Lumora earns tokens — and tokens decide **who keeps their seat**.

- Tokens are **not purchasable** and **not tradeable** between sudos
- They are granted only by **Prime** or the **Right-Hand** — either for cleared tasks or directly
- When a cycle ends, the sudo with the **fewest tokens is demoted** and stripped of all power
- Tokens double as **real in-game currency** in the Token Shop — so everyone campaigns to wear the crown

---

## THE HIERARCHY

| Role | Powers |
|------|--------|
| 👑 **Prime** (Father of Lumora) | Everything: post tasks, give tokens, clear tasks, run the cycle, promote/demote |
| 🗡️ **Right-Hand (RHM)** | Everything Prime can do with tokens: post tasks, give tokens to any admin or sudo, clear tasks |
| 🛡️ **Sudos** | Take up tasks (`.claim`), set their admin name, earn and spend tokens |

---

## HOW TASKS WORK

Prime or the Right-Hand posts a task:

```
.admin <task description>
```

The moment a task is posted:

- **Every sudo is DM'd** the task description
- The task is **tagged in the group chat** so everyone sees it
- The task gets an **ID** (e.g. `TABC1`) used for claiming and clearing

**Bigger tasks, bigger pay** — put the token count first for a multi-token task:

```
.admin 2 <task description>     ← worth 2 tokens
```

---

## CLAIMING & CLEARING

**Taking a task up (any sudo):**

```
.claim <task-id>
```

Claiming does **NOT lock** the task — multiple hands can work it at once. The moment someone claims:

- The claimer is **shown by their admin name**
- **Prime and the Right-Hand are DM'd** that this admin has taken the task up
- **Whoever reports back first** gets verified first

**Clearing (Prime or Right-Hand only)** — after checking the work is really done:

```
.task--<task-id>-cleared
```

or target a specific admin:

```
.task--<task-id>-cleared @admin
```

Clearing a task:

- Grants the task's tokens
- **Notifies everyone who took it up** that the task (with its description) is done
- Marks the task complete in the Council ledger

---

## TOKEN GRANTS

Prime and the Right-Hand can grant tokens to **any admin or sudo** directly — for work outside the task system, initiative, or loyalty:

```
.token-give @user <amount>
```

Grants are recorded in the recipient's token history.

---

## ADMIN NAMES

Sudos set the name displayed on all admin work (claims, clears, token records):

```
.admin-name <name>
```

This is the identity the Council sees — choose it well.

---

## THE CYCLE — RISE OR FALL

When Prime runs:

```
.cycle-admin
```

- The sudo with the **fewest tokens this cycle** is **demoted from sudo and stripped of all power**
- The remaining council keeps their seats
- A **new cycle begins** — token counts reset the race, and the climb starts again

> Do the work. Claim the glory. Or step aside.

---

## THE TOKEN SHOP

Tokens are real currency. Spend them with `.token-buy <item>`:

| Cost | Item | Reward |
|------|------|--------|
| 🪙 1 | 💰 Lucons | 1,000 Lucons — instant cash for the market |
| 🪙 2 | 📊 Stat Points | +5 stat points — grow without the grind |
| 🪙 3 | ⚡ Full Refill | HP + hunt energy + combat energy fully restored |

Browse anytime with `.token-shop`.

---

## LEADERBOARD

```
.admin-lb
```

Shows who's earning the most. The bottom of this board is where the cycle's demotion falls — watch your rank.

```
.tokens
```

Shows your own balance and recent history.

---

## QUICK REFERENCE

| Command | Who | What it does |
|---------|-----|--------------|
| `.admin <task>` | Prime / RHM | Post a task — DMs all sudos, tags the GC |
| `.admin 2 <task>` | Prime / RHM | Post a 2-token task |
| `.claim <task-id>` | Sudos | Take a task up (no lock; issuer is DM'd) |
| `.task--<id>-cleared [@admin]` | Prime / RHM | Verify & clear — grants tokens, notifies takers |
| `.token-give @user <n>` | Prime / RHM | Grant tokens to any admin or sudo |
| `.admin-name <name>` | Sudos | Set the name shown on admin work |
| `.tokens` | Anyone holding tokens | Balance + history |
| `.admin-lb` | Anyone | Token leaderboard |
| `.token-shop` | Anyone holding tokens | Browse the shop |
| `.token-buy <item>` | Anyone holding tokens | Spend tokens (lucons / points / refill) |
| `.cycle-admin` | Prime | Demote the lowest earner, reset the cycle |
| `.help admin` | Anyone | Prime's speech — this system in-chat |

---

*Document for Lumora v1.2.5 — "The Scroll Trials"*
*Last updated: September 2026*
