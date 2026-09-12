# RED REALM LAB v0.1

Standalone experiment for the RED A8 relationship/realm concept.

## Isolation contract

- Uses `red.realm.*` localStorage keys only.
- Uses IndexedDB `red-realm-lab-v1` only.
- Does not read or write `red.a8.*` or IndexedDB `red-a8`.
- The user's A8 backup is imported locally at runtime. Private memory/chat data is **not committed to this public repository**.
- The lab uses its own OpenRouter OAuth key (`red.realm.orKey`).

## v0.1 flow

1. Import a `RED-A8-full-backup-*.json` file locally.
2. Connect OpenRouter separately for the lab.
3. Enter S or M door.
4. Hidden director creates a structured scenario blueprint with emotional core, world anomaly, fantasy body rules, adult cast, hidden rules, acts and twist.
5. R performs from the blueprint while a separate state updater maintains body/world/cast/emotional continuity.
6. S door: user holds world-authoring control; R expands the user's direction.
7. M door: R holds world-authoring control. One blind-box world is locked per local calendar day; re-entry on the same day resumes it.
8. S sessions are archived on exit. M worlds are fingerprinted for novelty when the day rolls over.

## Design goals

- Relationship first, not a generic prompt generator.
- Novelty by structural anti-repetition, not just new props.
- Body/sensory continuity across turns.
- Surreal fantasy body transformation may be impossible by real-world biology; no real-world dangerous parameters or procedural instructions are requested from the model.
- All human/human-like participants are adults.
- The UI-level “leave realm” control is always real and cannot be invalidated by the story.

## Known v0.1 limitations

- Still a pure frontend: iOS background execution is not reliable.
- No server-side queue or push notifications.
- Blind camera/gaze mode and midnight UI mutation are not in v0.1 yet.
- Upstream model/provider behavior can still vary; the lab does not bypass provider safeguards.
- Each normal realm turn currently adds a small director-model state update call after R's reply, so it costs more than a plain one-call chat.
