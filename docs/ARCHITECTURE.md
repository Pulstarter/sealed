# Architecture

SEALED separates content preparation from consequence resolution.

## Preparation prototype

A short Meta conversation extracts the player's declared preferences, intensity and exclusions. The player reviews a proposal before requesting generation. The server prepares a bounded world, prose and illustrations, validates the contract and continuity, and can request bounded repairs. A failed preparation does not start an adventure. This pipeline remains experimental and is not the primary public presentation path.

## Reviewed public entry

`apps/server/assets/reviewed-demo.json` contains an already reviewed fictional story, its original canonical bytes, SHA-256 seal and three image blobs. The server verifies the canonical hash and every image hash before using it. The public `/demo` creates a separate run of this prepared content without contacting a provider. The asset is server-side during ordinary play; the open-source repository intentionally permits inspecting its fictional branches and spoilers.

## Play

The pure TypeScript engine maintains `players[]`, actor identifiers, action times and server sequences. Reading is untimed. Each of three decisions starts only after the player presses Start decision. The server owns deadlines and resolves A, B or timeout consequences deterministically. The browser renders the current projection, calculates a local countdown and resynchronizes with the server; it does not choose consequences.

SQLite stores journeys, accepted actions and recovery state. The prepared entry has a separate database, cookie, API and browser-storage namespace. Reloading and reconnecting recover an existing journey rather than starting generation. Local tests use temporary databases and synthetic fixtures.

## Envelope

Before play, the server commits content, branches, factual text and art references. After the ending, the envelope displays the actual decisions, their outcome, the prepared reveal and seal verification. The SHA-256 commitment proves that the committed bytes match; it does not prove narrative quality, uniqueness or confidentiality against someone reading this public source.

## Interface and delivery

Vue adapts the reader, choices, cast and envelope to desktop and narrow screens. The retained earlier Spanish adventure and real-time prototype use their existing routes and stores. The submitted entry is the prepared English `/demo`. Provider keys remain server-side and are unnecessary for this entry.
