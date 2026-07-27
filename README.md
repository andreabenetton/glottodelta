# Glottodelta

Interactive, demographically weighted visualization of how the symbols of the
**International Phonetic Alphabet** are distributed across the world's languages.

Built on open language data — [PHOIBLE](https://phoible.org/) phoneme
inventories, [Glottolog](https://glottolog.org/) identifiers and
[CLDR](https://cldr.unicode.org/) population estimates — it renders the canonical
IPA charts (pulmonic and non‑pulmonic consonants, vowels, clicks, implosives,
ejectives) and, for each of the 111 symbols, reports two metrics:

- **L** — the number of source‑attested languages that use the sound.
- **P** — the share of speakers (demographically weighted) whose language uses
  it, counting only verified/curated mappings and alternative realizations.

Select any language to see its phoneme–grapheme profile highlighted on the
chart, compare two languages side by side, listen to official IPA audio, and
deep‑link any view via the URL.

## Coverage and honesty

The dataset covers **every** PHOIBLE source‑attested language (~2,100 after
deduplication). Only a subset (~384) can be linked to a **verified population
estimate**; those drive **P**. Every other language is still fully browsable and
counted in **L**, but carries **no population** and never enters **P** — it is
never silently treated as zero. The interface labels each language's
demographic‑certainty tier and orthography‑verification level explicitly, and a
provenance dialog exposes sources, licences, counts, a runtime SHA‑256 of the
embedded data, and the live status of external dependencies.

## Local development

```bash
# serve the static site (any static server works)
cd public && python3 -m http.server 8000
# open http://127.0.0.1:8000
```

Use `127.0.0.1`/`localhost` (a secure context) so the provenance checksum can
run. Tests use the environment's preinstalled Chromium:

```bash
node scripts/smoke.mjs      # regression checks
node scripts/functest.mjs   # functional checks across language tiers
```

## Regenerating the data

The app's data is generated from the frozen original at
`baseline/original.html`:

```bash
python3 scripts/build_data.py
```

This writes the normalized data module (`public/assets/js/data.js`), the
canonical JSON (`public/data/`), and a data‑quality report
(`docs/data-report.md`). See [`CLAUDE.md`](./CLAUDE.md) for the architecture,
data model and methodology invariants.

## Deployment

Static site for **Cloudflare Pages** — set the output directory to `public/`.
No build step is required (the generated `data.js` is committed).

## Licences

Component licences are honored per source and documented in the app's
provenance dialog: IPA chart artwork CC BY‑SA 4.0; official IPA audio
CC BY‑NC‑ND 4.0 (streamed, not redistributed); PHOIBLE CC BY‑SA 3.0; CLDR under
the Unicode licence. Attribution and versions are listed in‑app.
