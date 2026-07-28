#!/usr/bin/env python3
"""Regenerate data/allophones.json from the PHOIBLE 2.0.1 CLDF ValueTable.

For every chart symbol (the keys of public/data/symbols.json) this collects the
set of PHOIBLE languages (glottocodes) where the symbol is documented as an
ALLOPHONE of some other phoneme — i.e. phonetic-level evidence that never enters
the phonemic inventory and therefore never enters L or P. Self-allophones
(Allophones listing the Value itself) are ignored.

The output is committed so that scripts/build_data.py stays deterministic and
network-free. Re-run this script only to refresh against a new PHOIBLE release,
then re-run build_data.py.

Usage:  python3 scripts/build_allophones.py [path/to/values.csv]
        (downloads the v2.0.1 ValueTable when no local path is given)
"""
import csv, io, json, os, sys, unicodedata, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VALUES_URL = 'https://raw.githubusercontent.com/cldf-datasets/phoible/v2.0.1/cldf/values.csv'
SYMBOLS_PATH = os.path.join(ROOT, 'public', 'data', 'symbols.json')
OUT_PATH = os.path.join(ROOT, 'data', 'allophones.json')


def main():
    if len(sys.argv) > 1:
        text = open(sys.argv[1], encoding='utf-8').read()
        source = sys.argv[1]
    else:
        text = urllib.request.urlopen(VALUES_URL).read().decode('utf-8')
        source = VALUES_URL

    chart_symbols = set(json.load(open(SYMBOLS_PATH, encoding='utf-8'))['symbols'].keys())
    nfc = unicodedata.normalize
    # PHOIBLE segment strings are NFD; chart symbols are NFC. Compare on NFC.
    per_symbol = {}          # symbol -> set(glottocode)
    documented_langs = set() # glottocodes with any non-self allophone documented
    all_langs = set()

    for row in csv.DictReader(io.StringIO(text)):
        glottocode = row['Language_ID']
        all_langs.add(glottocode)
        value = nfc('NFC', row['Value'])
        allophones = row['Allophones'].split() if row['Allophones'] else []
        for raw in allophones:
            phone = nfc('NFC', raw)
            if phone == value:
                continue
            documented_langs.add(glottocode)
            if phone in chart_symbols:
                per_symbol.setdefault(phone, set()).add(glottocode)

    out = {
        '_meta': {
            'source': source if source == VALUES_URL else VALUES_URL,
            'phoible_release': '2.0.1',
            'languages_in_valuetable': len(all_langs),
            'languages_with_allophone_docs': len(documented_langs),
            'note': 'symbol -> glottocodes where the symbol is a documented allophone '
                    'of a DIFFERENT phoneme. Phonetic-level evidence only; never part '
                    'of L or P. Coverage is uneven: absence of a language here is not '
                    'evidence that the phone does not occur in it.',
        },
        'symbols': {s: sorted(gs) for s, gs in sorted(per_symbol.items())},
    }
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write('\n')
    total = sum(len(v) for v in out['symbols'].values())
    print(f'wrote {OUT_PATH}: {len(out["symbols"])} chart symbols, '
          f'{total} (symbol, language) allophone pairs; '
          f'{len(documented_langs)}/{len(all_langs)} ValueTable languages have allophone docs')


if __name__ == '__main__':
    main()
