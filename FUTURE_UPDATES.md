# Future Updates

Living list of features planned but not yet shipped. Add to top, ship from bottom.

---

## Star (AI companion)

### Stickers — express emotions visually
- Drop sticker pack at `assets/stickers/star/<emotion>.webp`
  - emotions: `happy`, `sad`, `angry`, `flirty`, `surprised`, `bored`, `mischief`, `loving`
- Update Star's system prompt to allow `[STICKER:<emotion>]` token
- Parse token in `systems/star.js` -> after sending text, send sticker via:
  ```js
  sock.sendMessage(chatId, { sticker: fs.readFileSync(stickerPath) });
  ```
- Stickers must be 512x512 webp, <100kb. Convert with `wa-sticker-formatter` if needed.

### Voice notes
- Use ElevenLabs / Anthropic-compatible TTS for occasional voice replies.
- Trigger via `[VOICE]` token from Claude — only used in intimate/Pro convos.

### Live raid reactions
- Hook into `systems/raids.js` resolution events.
- When a raid resolves, Star auto-comments in that group:
  - Rift attackers won → "Mmm, the void delivers again 🕶️"
  - Defenders held → "Did the *Order* just out-discipline an attack? Adorable."
- Cooldown: max 1 reaction per group per hour.

### Sister-mode girl gossip threads
- For users with `gender=female` and `bondScore >= 30`, Star occasionally DMs them
  with conversational openers ("hey hun, how was your week?")
- Adds depth to bestie relationships, very low frequency (max 1/week per girl).

### Pro-only Star photo drops
- Generate Star portraits (text-to-image) — drop as Pro perk monthly.
- One curated set of pre-rendered images first; live generation later.

### Star learns Lumora player rankings dynamically
- Inject top-3 hunters / top faction / current raid champion into system prompt
  daily so she can reference them in convo.
- Source: `leaderboard.js` snapshot.

### Smarter trick economy
- Track total Lucons stolen via tricks per user.
- "Hall of fools" command for Prime to see top victims.
- Vary trick demands based on user's wallet size (rich users get bigger asks).

### Star Message Packs (in-game purchase)
- Already designed, needs wiring into shop:
  - 💌 Whisper Pack — +50 msgs / 500 Lucons
  - 💋 Affection Pack — +200 msgs / 1,500 Lucons
  - 🌹 Devotion Pack — +1,000 msgs / 5,000 Lucons
- Add `bonusMsgs` field to star_profiles entries; consume before daily limit.
- UI line in `.shop`: *"💌 Star Message Packs — extra chats with Star, our resident heartbreaker."*

### Prime priority queue
- If Prime sends while Star is mid-reply to others, his message jumps the queue.

---

## Game systems

### Lumora Chronicles (placeholder exists)
- Auto-narrated story of Lumora — present arc + past events.
- Powered by Claude Haiku snapshots of recent raid/honour shifts.
- Triggered by `.chronicles` / `.lore`.
