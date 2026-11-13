#!/usr/bin/env python3
"""
Вивантаження з бази сайту G.O.D. (charsheet.db) у JSON для імпорту у Foundry.

    python3 tools/site-export.py /шлях/до/charsheet.db  [вихід.json]

Береться лише те, що потрібно у Foundry: листи персонажів (з аватарами), вороги з «Бою майстра»,
предмети майстра, склади пачок і товари торговців. Акаунти, паролі, логи, кидки й нотатки
сайту НЕ вивантажуються. База відкривається лише на читання.
"""
import json
import sqlite3
import sys
from datetime import datetime, timezone

# службові поля листа сайту, які у Foundry не потрібні
SKIP_SHEET_KEYS = {'__touched', '_dashboardLayout', '_skillDraft', '_statDraft'}


def loads(s, default):
    try:
        return json.loads(s) if s else default
    except (TypeError, ValueError):
        return default


def item_row(row_type, name, description, data, qty=None):
    item = loads(data, {})
    item.update({'type': row_type, 'name': name, 'description': description or item.get('description', '')})
    if qty is not None:
        item['amount'] = qty
    return item


def export(db_path):
    con = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
    q = lambda sql: con.execute(sql).fetchall()
    parties = {pid: name for pid, name in q('select id, name from parties')}
    char_party = {cid: pid for pid, cid in q('select party_id, char_id from party_members')}

    characters = []
    for cid, slot, archived, sheet in q('select id, slot_name, archived, sheet_data from characters order by id'):
        sd = loads(sheet, {})
        characters.append({
            'id': cid, 'slotName': slot or '', 'archived': bool(archived),
            'party': parties.get(char_party.get(cid), ''),
            'sheet': {k: v for k, v in sd.items() if k not in SKIP_SHEET_KEYS},
        })

    enemies = []
    for pid, raw in q('select party_id, enemies from party_combat'):
        for e in loads(raw, []):
            e = {k: v for k, v in e.items() if k not in ('x', 'y', 'w', 'h')}
            e.update({'party': pid, 'partyName': parties.get(pid, '')})
            enemies.append(e)

    gm_items = [item_row(t, n, d, data) for t, n, d, data in q('select type, name, description, data from gm_items order by id')]
    storages = [{'id': sid, 'name': name, 'partyName': parties.get(pid, ''), 'maxW': max_w, 'items': loads(items, [])}
                for sid, pid, name, max_w, items in q('select id, party_id, name, max_w, items from party_storages order by id')]
    merchants = []
    for mid, name, location in q('select id, name, location from merchants order by id'):
        rows = con.execute('select type, name, description, data, qty from merchant_items where merchant_id = ? order by id', (mid,)).fetchall()
        merchants.append({'id': mid, 'name': name, 'location': location or '', 'items': [item_row(*r) for r in rows]})

    return {
        'format': 'god-site-export', 'version': 1,
        'exportedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'characters': characters, 'enemies': enemies, 'gmItems': gm_items, 'storages': storages, 'merchants': merchants,
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = sys.argv[2] if len(sys.argv) > 2 else 'god-site-export.json'
    data = export(sys.argv[1])
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    print(f"{out}: персонажів {len(data['characters'])}, ворогів {len(data['enemies'])}, "
          f"предметів майстра {len(data['gmItems'])}, складів {len(data['storages'])}, торговців {len(data['merchants'])}")
