#!/usr/bin/env python3
# Glottodelta — demographically weighted distribution of IPA symbols.
# Copyright (C) 2026 Andrea Benetton
#
# This program is free software: you can redistribute it and/or modify it under
# the terms of the GNU Affero General Public License as published by the Free
# Software Foundation, either version 3 of the License, or (at your option) any
# later version. This program is distributed WITHOUT ANY WARRANTY; without even
# the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
# See the GNU Affero General Public License <https://www.gnu.org/licenses/> and
# the LICENSE file distributed with this program for details.
"""
build_data.py — Glottodelta data pipeline.

Reads the frozen single-file app (baseline/original.html), extracts the embedded
data constants, cleans and NORMALISES the big DATA blob, and emits:

  public/assets/js/data.js   deployable synchronous data module (classic script)
  data/languages.json        canonical language dictionary (inspectable source)
  data/symbols.json          per-symbol language-index arrays (inspectable source)
  data/name-fixes.json       every raw->canonical name change we applied
  docs/data-report.md        data-quality analysis + normalisation metrics

Design invariants (see CLAUDE.md):
  * Language identity uses a COMPOSITE key: the ISO 639-3 code, except when the
    code is a non-distinguishing placeholder ('mis','und',''/None) in which case
    the Glottocode is used. This fixes the PHOIBLE 'mis' collapse while still
    deduplicating true doculects by ISO (the documented L rule).
  * Demographic certainty is a hard tier: d=1 iff the ISO has a SPEAKER_ESTIMATES
    entry. Tier-0 languages carry NO population and never enter the P universe.
  * count/inventories/pct on DATA records are DEAD (never read at runtime) and are
    dropped. Only the per-symbol language lists survive.
"""
import re, json, os, sys, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, 'baseline', 'original.html')

PLACEHOLDER_ISO = {None, '', 'mis', 'und'}

# ---- raw JS constant extraction -------------------------------------------------
def extract_raw(js, name):
    """Return (value_text, has_semicolon) for `const NAME = <value>[;]`."""
    m = re.search(r'\b(?:const|let|var)\s+' + re.escape(name) + r'\s*=\s*', js)
    if not m:
        raise KeyError(name)
    i = m.end()
    op = js[i]
    cl = {'{': '}', '[': ']'}[op]
    depth = 0; j = i; instr = None; esc = False
    while j < len(js):
        c = js[j]
        if instr:
            if esc: esc = False
            elif c == '\\': esc = True
            elif c == instr: instr = None
        else:
            if c in '"\'`': instr = c
            elif c == op: depth += 1
            elif c == cl:
                depth -= 1
                if depth == 0:
                    end = j + 1
                    semi = end < len(js) and js[end] == ';'
                    return js[i:end], semi
        j += 1
    raise ValueError('unbalanced ' + name)

# ---- name cleaning --------------------------------------------------------------
# The 7 escaping-artifact names get explicit, linguistically vetted canonical forms
# (a blanket "strip trailing quote" is unsafe: Wari' legitimately ends in a glottal).
CURATED_NAMES = {
    "Coeur d''Alene'": "Coeur d'Alene",
    "Ida''an'": "Ida'an",
    "Ke''o; Kéo'": "Ke'o; Kéo",
    "Ngad''a; Ngadha'": "Ngad'a; Ngadha",
    "Tatana''; Tatanaq; Tatana'": "Tatana; Tatanaq",
    "Wari'": "Wari'",  # real apostrophe — keep
    "Blang; Plang; Bulang; Pulang; Pula; Kawa; K''ala; Kontoi'":
        "Blang; Plang; Bulang; Pulang; Pula; Kawa; K'ala; Kontoi",
}

def load_overrides():
    """Curated per-key canonical-name overrides produced by the name audit."""
    path = os.path.join(ROOT, 'data', 'name-overrides.json')
    if os.path.exists(path):
        return json.load(open(path, encoding='utf-8'))
    return {}

def load_endonyms():
    """Curated autonyms per language, in the language's own script.

    Keys follow the name-overrides convention ('i:<iso>' / 'g:<glottocode>');
    values are lists of search-matchable strings. Used for search only — the
    displayed canonical name is unaffected.
    """
    path = os.path.join(ROOT, 'data', 'endonyms.json')
    if not os.path.exists(path):
        return {}
    raw = json.load(open(path, encoding='utf-8'))
    out = {}
    for k, v in raw.items():
        if k.startswith('_'):
            continue
        terms = [t.strip() for t in (v if isinstance(v, list) else [v]) if str(t).strip()]
        if terms:
            out[k] = terms
    return out

def load_orthography_supplement():
    """Supplemental curated orthography profiles (data/orthography-supplement.json).

    Keys are ISO 639-3 codes; each value carries an ORTHO-format phoneme->grapheme
    map ('ortho') and a full VERIFIED_LANGUAGE_PROFILES-shaped entry ('profile').
    Emitted as SUPPLEMENTAL_ORTHO / SUPPLEMENTAL_LANGUAGE_PROFILES and merged at
    runtime in app-core.js; baseline data always wins on collision.
    """
    path = os.path.join(ROOT, 'data', 'orthography-supplement.json')
    if not os.path.exists(path):
        return {}, {}
    raw = json.load(open(path, encoding='utf-8'))
    ortho, profiles = {}, {}
    for iso, entry in raw.items():
        if iso.startswith('_'):
            continue
        omap = entry.get('ortho') or {}
        assert all(isinstance(v, str) and v for v in omap.values()), \
            'ortho values must be non-empty strings: %s' % iso
        profile = entry.get('profile') or {}
        assert profile.get('status') and isinstance(profile.get('rows'), list), \
            'profile needs status + rows: %s' % iso
        assert all(r.get('grapheme') and isinstance(r.get('phonemes'), list)
                   for r in profile['rows']), 'bad row in %s' % iso
        if omap:
            ortho[iso] = omap
        profiles[iso] = profile
    return ortho, profiles

def load_languages_supplement():
    """Curated historical languages outside PHOIBLE (data/languages-supplement.json).

    Stats-neutral: emitted as SUPPLEMENTAL_LANGUAGES and merged into the picker
    directory + LANGUAGE_PHONEME_MODELS at runtime, never into SYMBOL_LANGS,
    so they cannot affect L, P, drawer lists or the audit.
    """
    path = os.path.join(ROOT, 'data', 'languages-supplement.json')
    if not os.path.exists(path):
        return {}
    raw = json.load(open(path, encoding='utf-8'))
    out = {}
    for iso, entry in raw.items():
        if iso.startswith('_'):
            continue
        assert entry.get('name') and entry.get('glottocode'), \
            'supplemental language needs name + glottocode: %s' % iso
        model = entry.get('model') or {}
        assert isinstance(model.get('phonemes'), dict) and model['phonemes'], \
            'supplemental language needs model.phonemes: %s' % iso
        out[iso] = {'name': entry['name'], 'glottocode': entry['glottocode'],
                    'aliases': entry.get('aliases') or [], 'model': model}
    return out

def clean_name(n):
    if n in CURATED_NAMES:
        return CURATED_NAMES[n]
    # generic SQL-style de-escaping of doubled apostrophes
    return n.replace("''", "'")

def is_allcaps(s):
    letters = [c for c in s if c.isalpha()]
    return bool(letters) and all(c.isupper() for c in letters)

def smart_title(s):
    # Title-case a lone ALL-CAPS artifact name: uppercase the first ALPHABETIC
    # character of each word (so click prefixes like ! ǀ ǁ ǂ keep the following
    # letter capitalised), lowercase the rest. Separators/diacritics untouched.
    def cap(word):
        out = []; seen = False
        for ch in word:
            if ch.isalpha():
                out.append(ch.upper() if not seen else ch.lower())
                seen = True
            else:
                out.append(ch)
        return ''.join(out)
    return ' '.join(cap(w) for w in s.split(' '))

def pick_canonical(names):
    """Choose one display name for a language from all attested spellings."""
    cleaned = sorted({clean_name(n) for n in names})
    mixed = [c for c in cleaned if not is_allcaps(c)]
    if mixed:
        # prefer the most naturally-cased spelling: most lowercase letters, then short, then alpha
        return sorted(mixed, key=lambda c: (-sum(ch.islower() for ch in c), len(c), c))[0]
    # all variants are all-caps -> title-case the shortest
    return smart_title(sorted(cleaned, key=lambda c: (len(c), c))[0])

# ---- main -----------------------------------------------------------------------
def main():
    html = open(SRC, encoding='utf-8').read()
    m = re.search(r'<script>\s*const DATA=', html)
    js = html[m.start():html.index('</script>', m.start())]

    DATA = json.loads(extract_raw(js, 'DATA')[0])
    SPEAK = json.loads(extract_raw(js, 'SPEAKER_ESTIMATES')[0])

    def key(L):
        iso = L.get('iso')
        if iso not in PLACEHOLDER_ISO:
            return 'i:' + iso
        g = L.get('glottocode')
        return 'g:' + g if g else 'n:' + str(L.get('name'))

    # gather unique languages + all spellings/glottocodes per key, preserving first-seen order
    order = []
    names_by_key = {}
    rep = {}  # key -> representative iso/glottocode
    for sym, rec in DATA.items():
        for L in rec['languages']:
            k = key(L)
            if k not in rep:
                rep[k] = L
                order.append(k)
                names_by_key[k] = []
            names_by_key[k].append(L['name'])

    # build language dictionary
    key_index = {k: i for i, k in enumerate(order)}
    # Manual endonym/preferred overrides from the name audit (raw canonical fixups
    # where the automatic heuristic picked a weaker name). Keyed by composite key.
    NAME_OVERRIDES = load_overrides()

    def norm_for_compare(n):
        return re.sub(r"['’\-\s]", '', clean_name(n)).lower()

    languages = []
    name_fixes = {}          # raw -> canonical (all changes)
    name_conflicts = {}      # key -> distinct base names (genuine multi-name, needs judgment)
    demo_count = 0
    for k in order:
        L = rep[k]
        iso = L.get('iso')
        glot = L.get('glottocode')
        if k in NAME_OVERRIDES:
            canonical = NAME_OVERRIDES[k]
        else:
            canonical = pick_canonical(names_by_key[k])
        for raw in sorted(set(names_by_key[k])):  # sorted: keeps name-fixes.json byte-stable
            if raw != canonical:
                name_fixes[raw] = canonical
        bases = sorted({clean_name(n) for n in names_by_key[k]})
        if len({norm_for_compare(n) for n in bases}) > 1:
            name_conflicts[k] = {'iso': iso, 'glottocode': glot,
                                 'candidates': bases, 'chosen': canonical}
        tier = 1 if (iso and iso in SPEAK) else 0
        demo_count += tier
        languages.append({'n': canonical, 'iso': iso, 'g': glot, 'd': tier})

    # per-symbol deduped language index arrays
    symbol_langs = {}
    for sym, rec in DATA.items():
        seen = {}
        for L in rec['languages']:
            k = key(L)
            seen[k] = key_index[k]
        symbol_langs[sym] = sorted(seen.values())

    # ---- write canonical json artifacts -----------------------------------------
    # Deployed + inspectable canonical data -> public/data/ (served at /data/*.json).
    # Curated inputs and audit records -> data/ (repo source, not deployed).
    os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'public', 'data'), exist_ok=True)
    langs_json = json.dumps(
        {'schema': 'glottodelta/languages@1',
         'note': 'index = language id; d=1 demographic-certain (has speaker estimate), d=0 attested-only (no population)',
         'count': len(languages), 'demographic': demo_count,
         'languages': languages}, ensure_ascii=False)
    syms_json = json.dumps(
        {'schema': 'glottodelta/symbols@1',
         'note': 'symbol -> sorted language ids (indices into languages.json)',
         'symbols': symbol_langs}, ensure_ascii=False)
    open(os.path.join(ROOT, 'public', 'data', 'languages.json'), 'w', encoding='utf-8').write(langs_json)
    open(os.path.join(ROOT, 'public', 'data', 'symbols.json'), 'w', encoding='utf-8').write(syms_json)
    open(os.path.join(ROOT, 'data', 'name-fixes.json'), 'w', encoding='utf-8').write(
        json.dumps(name_fixes, ensure_ascii=False, indent=1))
    open(os.path.join(ROOT, 'data', 'name-conflicts.json'), 'w', encoding='utf-8').write(
        json.dumps(name_conflicts, ensure_ascii=False, indent=1))

    # ---- assemble deployable data.js -------------------------------------------
    # compact literals for DATA normalisation
    lang_arr = '[' + ','.join(
        '[' + json.dumps(l['n'], ensure_ascii=False) + ',' +
        json.dumps(l['iso']) + ',' + json.dumps(l['g']) + ',' + str(l['d']) + ']'
        for l in languages) + ']'
    sym_obj = '{' + ','.join(
        json.dumps(s) + ':[' + ','.join(map(str, ids)) + ']'
        for s, ids in symbol_langs.items()) + '}'
    ENDONYMS = load_endonyms()
    endonyms_obj = json.dumps(ENDONYMS, ensure_ascii=False, sort_keys=True,
                              separators=(',', ':'))
    SUPP_LANGS = load_languages_supplement()
    supp_langs_obj = json.dumps(SUPP_LANGS, ensure_ascii=False, sort_keys=True,
                                separators=(',', ':'))
    SUPP_ORTHO, SUPP_PROFILES = load_orthography_supplement()
    supp_ortho_obj = json.dumps(SUPP_ORTHO, ensure_ascii=False, sort_keys=True,
                                separators=(',', ':'))
    supp_profiles_obj = json.dumps(SUPP_PROFILES, ensure_ascii=False, sort_keys=True,
                                   separators=(',', ':'))

    # verbatim non-DATA data constants, in original declaration order
    VERBATIM = ['SPEAKER_ESTIMATES', 'ORTHO', 'ORTHO_BY_ISO', 'LANGUAGE_PHONEME_MODELS',
                'GEORGIAN_ALPHABET_ROWS', 'VERIFIED_LANGUAGE_PROFILES', 'VERIFIED_ORTHO',
                'WRITING_SYSTEM_META', 'IPA_AUDIO_FILES', 'IPA_AUDIO_VOICES']
    verbatim_blocks = []
    audio_overrides_path = os.path.join(ROOT, 'data', 'audio-overrides.json')
    for name in VERBATIM:
        val, _ = extract_raw(js, name)
        if name == 'IPA_AUDIO_FILES' and os.path.exists(audio_overrides_path):
            # Apply curated filename corrections (see data/audio-overrides.json).
            overrides = {k: v for k, v in
                         json.load(open(audio_overrides_path, encoding='utf-8')).items()
                         if not k.startswith('_')}
            if overrides:
                files = json.loads(val)
                unknown = [k for k in overrides if k not in files]
                assert not unknown, 'audio override for unknown symbol(s): %s' % unknown
                files.update(overrides)
                val = json.dumps(files, ensure_ascii=False, separators=(',', ':'))
        verbatim_blocks.append('const %s=%s;' % (name, val))

    data_js = (
        "/* Glottodelta — Copyright (C) 2026 Andrea Benetton.\n"
        "   Licensed under the GNU Affero General Public License v3 or later;\n"
        "   see the LICENSE file distributed with this program.\n\n"
        "   GENERATED by scripts/build_data.py — do not edit by hand.\n"
        "   Normalised language data for the Glottodelta IPA app.\n"
        "   LANG_DICT rows: [name, iso, glottocode, demographicTier(0|1)]\n"
        "   SYMBOL_LANGS: symbol -> language ids (indices into LANG_DICT).\n"
        "   DATA is reconstructed synchronously into the shape the app expects. */\n"
        "const LANG_DICT=" + lang_arr + ";\n"
        "const ENDONYMS=" + endonyms_obj + ";\n"
        "const SUPPLEMENTAL_LANGUAGES=" + supp_langs_obj + ";\n"
        "const SUPPLEMENTAL_ORTHO=" + supp_ortho_obj + ";\n"
        "const SUPPLEMENTAL_LANGUAGE_PROFILES=" + supp_profiles_obj + ";\n"
        "const SYMBOL_LANGS=" + sym_obj + ";\n"
        "const LANGUAGE_TIER=(()=>{const m=new Map();for(const r of LANG_DICT){if(r[1])m.set(r[1],r[3]);}return m;})();\n"
        "const DATA=(()=>{const o={};for(const s in SYMBOL_LANGS){o[s]={languages:SYMBOL_LANGS[s].map(i=>{const r=LANG_DICT[i];return{name:r[0],iso:r[1],glottocode:r[2]};})};}return o;})();\n"
        + "\n".join(verbatim_blocks) + "\n"
    )
    os.makedirs(os.path.join(ROOT, 'public', 'assets', 'js'), exist_ok=True)
    open(os.path.join(ROOT, 'public', 'assets', 'js', 'data.js'), 'w', encoding='utf-8').write(data_js)

    # ---- metrics + report ------------------------------------------------------
    total_entries = sum(len(r['languages']) for r in DATA.values())
    orig_data_bytes = len(extract_raw(js, 'DATA')[0].encode())
    norm_bytes = len(lang_arr.encode()) + len(sym_obj.encode())
    mis_glot = len({L.get('glottocode') for r in DATA.values() for L in r['languages']
                    if L.get('iso') in PLACEHOLDER_ISO})
    endonym_matched = sum(1 for l in languages
                          if ('i:' + l['iso']) in ENDONYMS or ('g:' + l['g']) in ENDONYMS)
    report = f"""# Glottodelta data report

_Generated by `scripts/build_data.py` from `baseline/original.html`._

## Dataset shape
- IPA symbols: **{len(DATA)}**
- Raw per-symbol language entries (with repetition): **{total_entries:,}**
- Unique languages (composite key): **{len(languages):,}**
  - demographic-certain (d=1, has speaker estimate): **{demo_count}**
  - attested-only (d=0, no population): **{len(languages) - demo_count:,}**
- ISO placeholder ('mis'/'und') distinct glottocodes rescued from collapse: **{mis_glot}**
- Languages with a curated endonym (searchable in their own script): **{endonym_matched}**
  of {len(ENDONYMS)} entries in `data/endonyms.json`
- Supplemental orthography profiles (`data/orthography-supplement.json`): **{len(SUPP_PROFILES)}**
  languages with full phoneme–grapheme maps and per-letter rows, merged at runtime
- Curated historical languages (`data/languages-supplement.json`, stats-neutral —
  picker/highlight/compare only, never in L or P): **{len(SUPP_LANGS)}**

## Normalisation
- Original inline `DATA` literal: **{orig_data_bytes:,} bytes**
- Normalised `LANG_DICT` + `SYMBOL_LANGS`: **{norm_bytes:,} bytes**
- Reduction: **{100 * (1 - norm_bytes / orig_data_bytes):.1f}%** (avg {total_entries/len(languages):.1f}x language repetition removed)
- Dead fields dropped from every record: `count`, `inventories`, `pct` (never read at runtime).

## Data-quality fixes
- **Escaping artifacts** ({len(CURATED_NAMES)} curated): doubled apostrophes de-escaped, stray
  wrapping quotes removed, genuine glottal apostrophes (e.g. `Wari'`) preserved.
- **Case-variant / spelling collapse**: {len(name_fixes)} raw spellings mapped to a single
  canonical display name per language (full list in `data/name-fixes.json`).
- **`mis` collapse fix**: languages coded `mis`/`und` are keyed by Glottocode so distinct
  languages are no longer merged under one ISO; {mis_glot} such languages kept distinct.

## Methodology invariants preserved
- **L (languages)** counts every source-attested language, deduplicated by the composite key.
- **P (population)** is summed ONLY over demographic-certain languages; attested-only
  languages carry no population and are absent from the P universe (not counted as zero).
"""
    os.makedirs(os.path.join(ROOT, 'docs'), exist_ok=True)
    open(os.path.join(ROOT, 'docs', 'data-report.md'), 'w', encoding='utf-8').write(report)

    print("languages:", len(languages), "| demographic:", demo_count,
          "| attested-only:", len(languages) - demo_count)
    print("name fixes:", len(name_fixes))
    print("data.js bytes:", len(data_js.encode()))
    print("normalisation reduction: %.1f%%" % (100 * (1 - norm_bytes / orig_data_bytes)))

if __name__ == '__main__':
    main()
