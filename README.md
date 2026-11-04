# SEALED

An illustrated mystery shaped by a short conversation and the player's choices. Read at your own pace; at three key moments, you have twelve seconds to decide. At the end, open the envelope and verify the story's original SHA-256 commitment.

**Play the reviewed demo:** https://sealed.patapalo.net/demo

**Source:** https://github.com/Pulstarter/sealed

**Three-minute demo video:** https://youtu.be/tn5gi1lxKHY (unlisted, accessible by link; English captions and original music).

## What the public demo does

The presentation entry uses **The Shelter Sheet**, an adventure generated earlier with Meta and reviewed before publication. This is labelled before play. Each run uses the same committed story and illustrations and records its own decisions and ending. It makes no new generation requests and needs no provider key to run locally.

1. Read freely, with no countdown while reading.
2. Review the options, then press **Start decision** to begin a twelve-second choice.
3. Make three decisions; an expired countdown has its own deterministic consequence.
4. Open the envelope to review the real decisions, reveal the prepared detail and check the original seal.
5. Reload or reconnect to resume the same journey, and reread a completed journey.

The experimental conversation and live-generation flow remains at [/preview](https://sealed.patapalo.net/preview). Fresh generation can fail validation and is **not** the primary presentation path. The chat clip in the video is a separate archived example, not the preparation session for the demonstrated story. See [limitations](docs/LIMITATIONS.md).

## Run locally

Use **Node.js 24 or newer**. The project uses Vue, a Node server and native SQLite. No Modal, Fireworks or Meta account is needed for the prepared demo.

```sh
npm ci
npm run check
npm test
npm run build
cp .env.example .env.local
node --env-file=.env.local dist/apps/server/src/main.js
```

Open **http://127.0.0.1:3000/demo**. The example configuration disables provider access. Keep `MODEL_API_KEY` blank for the prepared demo. Enabling generation can incur provider charges; review the runtime limits before enabling it.

The default main database is `data/sealed.sqlite`. Demo runs use a separate `data/sealed.sqlite.demo.sqlite`, cookie, API and browser-storage namespace. These files are created locally; no player databases or credentials are supplied. Preserve both databases and their associated art to retain journeys.

## How Meta is used

The preparation prototype integrates `muse-spark-1.3` for conversational preference extraction and world preparation, `muse-wonder-1.0` for prose, and `muse-image-1.0` for an environment illustration and two fictional portraits. These are the identifiers requested by the implementation, not a claim about the provider's full catalogue. The public prepared adventure's three illustrations were generated with Meta Image.

The TypeScript engine resolves choices and deadlines. Meta does not improvise consequences after a player's decision. Content, branches, factual text and image references are committed before play. The seal verifies those bytes; it does not certify literary quality or guarantee that two generated stories cannot resemble one another.

SEALED uses declared fiction preferences to explore an experience appropriate to a player's current mood. It offers fiction and reflection, not clinical assessment, diagnosis or treatment. Human benefit is an intended outcome, not a measured efficacy claim.

## Project map

- `packages/engine/`: deterministic story state, choices, projections and tests.
- `apps/server/`: Meta integration, validation, durable sessions, HTTP, events and prepared demo asset.
- `apps/web/`: responsive Vue interface, local fonts and prepared art.
- `docs/ARCHITECTURE.md`: content preparation, engine, persistence and commitment.
- `docs/PROVENANCE.md`: hackathon contribution and asset provenance.
- `docs/LIMITATIONS.md`: verified boundaries and known limitations.

The prepared English `/demo`, experimental `/preview`, earlier Spanish `/` adventure and `/legacy` real-time prototype are retained as separate experiences. Multiplayer, native-store distribution, voice input and long asynchronous adventures are outside the submitted demo.

## Verification

`npm run check`, `npm test` and `npm run build` run locally without provider access. Tests cover deterministic choices, all 27 routes of the bounded structure, expiration, reconnect behavior, information filtering, persistence, ownership, presentation and commitment hashes. Tests use synthetic fixtures and temporary databases.

Automated tests and browser emulation do not certify enjoyment, emotional impact, physical-device behavior or human reading speed. The ten-to-twelve-minute duration is a reading target. Reliable live generation remains unfinished; the reviewed prepared entry is the submission demonstration.

## License and data

The project's original code and documentation are available under the [MIT License](LICENSE). Third-party fonts retain their SIL Open Font License notices. See [asset and dependency notices](THIRD_PARTY_NOTICES.md).

This repository is a reviewed publication snapshot. It excludes local keys, databases, conversations, provider receipts, private QA evidence and deployment credentials. Original development history and private runtime data remain outside this public snapshot. The bundled reviewed story is fictional demonstration content, not a player conversation or database dump.
