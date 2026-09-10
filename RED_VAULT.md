# RED Vault v1

`*.redvault` is RED PROTOCOL's explicit, user-controlled migration format.

## Purpose

A user can move to a new phone without forcing RED to relearn the relationship from scratch.

The vault includes:

- role/profile configuration
- current relationship state
- conversation history
- compact continuity memory
- structured learned memory items
- imported public/reference archive
- local app settings

The vault intentionally excludes model weights and browser model caches because they are large and can be downloaded again on the new phone.

## Privacy model

- No automatic cloud sync.
- Export happens only after an explicit user action.
- The payload is encrypted in the browser with AES-256-GCM.
- The encryption key is derived from the migration passphrase using PBKDF2-HMAC-SHA256.
- Salt and IV are random for every export.
- AES-GCM authentication detects a wrong password or modified/corrupted archive.
- The passphrase is not stored inside the archive.

The user may transfer the encrypted file with AirDrop, Apple Files, removable storage, or any other method they choose. If the user places it in cloud storage, the RED contents remain encrypted inside the vault file.

## Restore flow

1. Install/open RED on the new phone.
2. Download the on-device model once.
3. Choose **Import RED Vault**.
4. Select the `.redvault` file.
5. Enter the migration passphrase.
6. RED restores identity, memories, reference archive, conversation continuity and settings.

Model weights are fetched separately and are not required to match the exact old cache representation, only a compatible model/configuration.

## Separation of private and public knowledge

The portable state keeps two distinct concepts:

- `memoryItems`: facts/preferences/boundaries learned from private interaction with the user.
- `references`: public/reference material explicitly imported by the user.

Reference material must never silently become a claimed personal preference. Personal memory must never be uploaded as part of the public reference archive.
