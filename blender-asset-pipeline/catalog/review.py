"""Build review sheet: board crop beside the built asset, QA checks, approve / reject.

Renders are shown at one shared display scale (DISPLAY_PX_PER_M), so relative sizes between
cards are true. Decisions are exported from the page as reviews.json, saved into data/, and
read on the next `run.py qa`; a decision goes stale when the item's build spec changes.
"""

from __future__ import annotations

import html
import json
from collections import Counter

DISPLAY_PX_PER_M = 80

_CSS = """
:root { --bg:#f4f2ee; --card:#fff; --ink:#24272b; --muted:#6b7078; --line:#e2dfd8; --pass:#2f7d4f;
        --fail:#b3261e; --unchecked:#8a5a14; }
* { box-sizing:border-box; }
body { margin:0; padding:24px 16px 80px; background:var(--bg); color:var(--ink);
       font:14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width:1400px; margin:0 auto; }
h1 { font-size:22px; margin:0 0 4px; } .muted { color:var(--muted); }
table { border-collapse:collapse; background:var(--card); margin:12px 0; }
th, td { text-align:left; padding:5px 10px; border-bottom:1px solid var(--line); font-variant-numeric:tabular-nums; }
.bar { position:sticky; top:0; z-index:2; display:flex; flex-wrap:wrap; gap:8px; align-items:center;
       background:var(--bg); padding:10px 0; border-bottom:1px solid var(--line); }
select, button { font:inherit; padding:5px 8px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(360px, 1fr)); gap:12px; margin-top:12px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:10px; }
.card[data-verdict=fail] { border-color:var(--fail); }
.pics { display:flex; gap:8px; align-items:flex-end; min-height:120px; overflow-x:auto; }
.pics figure { margin:0; } .pics figcaption { font-size:11px; color:var(--muted); }
.crop { max-height:160px; max-width:160px; object-fit:contain; background:#ecebe7; border-radius:4px; }
.name { font-weight:600; margin-top:8px; } .meta { font-size:12px; color:var(--muted); }
.tag { display:inline-block; font-size:11px; padding:1px 7px; border-radius:10px; color:#fff; }
.pass { background:var(--pass); } .fail { background:var(--fail); } .unchecked { background:var(--unchecked); }
ul.checks { margin:6px 0; padding-left:18px; font-size:12px; }
ul.checks .s-fail { color:var(--fail); font-weight:600; } ul.checks .s-unchecked { color:var(--unchecked); }
.decide { display:flex; gap:12px; align-items:center; margin-top:6px; font-size:13px; }
.decide input[type=text] { flex:1; font:inherit; padding:3px 6px; }
"""

_JS = """
const existing = JSON.parse(document.getElementById('existing').textContent);
function applyFilters() {
  const v = document.getElementById('f-verdict').value, f = document.getElementById('f-family').value,
        r = document.getElementById('f-review').value;
  document.querySelectorAll('.card').forEach(c => {
    const show = (!v || c.dataset.verdict === v) && (!f || c.dataset.family === f) && (!r || c.dataset.review === r);
    c.style.display = show ? '' : 'none';
  });
}
document.querySelectorAll('.bar select').forEach(s => s.addEventListener('change', applyFilters));
document.getElementById('export').addEventListener('click', () => {
  const out = Object.assign({}, existing);
  document.querySelectorAll('.card').forEach(c => {
    const picked = c.querySelector('input[type=radio]:checked');
    if (!picked) return;
    out[c.dataset.id] = { decision: picked.value, specHash: c.dataset.hash, buildHash: c.dataset.build,
                          note: c.querySelector('input[type=text]').value };
  });
  const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'reviews.json'; a.click();
});
"""


def _e(value) -> str:
    return html.escape(str(value))


def _card(item: dict, build: dict) -> str:
    crops = "".join(f'<figure><img class="crop" loading="lazy" src="{_e(s["crop"])}" alt=""><figcaption>'
                    f'{_e(s["board"].split(" ")[0])} board</figcaption></figure>'
                    for s in item["sources"][:2] if s["crop"])
    thumb = build.get("thumb")
    render = (f'<figure><img loading="lazy" src="{_e(thumb["url"])}" width="{thumb["width"] // 2}" '
              f'height="{thumb["height"] // 2}" alt=""><figcaption>built, {DISPLAY_PX_PER_M} px/m</figcaption></figure>'
              if thumb else '<figure><div class="meta">no render</div></figure>')
    checks = "".join(f'<li class="s-{c["status"]}">{_e(c["name"])}: {_e(c["detail"])}</li>' for c in build["checks"])
    review = build["review"]
    radios = "".join(f'<label><input type="radio" name="d-{_e(item["id"])}" value="{v}"'
                     f'{" checked" if review == v else ""}> {v}</label>' for v in ("approved", "rejected"))
    measured = build.get("measuredM")
    size = " × ".join(f"{measured[a]:.2f}" for a in "wdh") + " m (w × d × h)" if measured else "—"
    label = _e(item["dimsText"] or "no size printed")
    if item.get("dimsOrigin") == "correction":
        label += ' <span class="tag unchecked">size from corrections.toml</span>'
    if all(s["origin"] == "hand" for s in item["sources"]):
        label += ' <span class="tag unchecked">hand-named: no printed label</span>'
    return (f'<div class="card" data-id="{_e(item["id"])}" data-hash="{_e(build["specHash"])}" '
            f'data-build="{_e(build["buildHash"])}" '
            f'data-verdict="{build["qa"]}" data-family="{_e(item["family"])}" data-review="{review}">'
            f'<div class="pics">{crops}{render}</div>'
            f'<div class="name">{_e(item["name"])} <span class="tag {build["qa"]}">{build["qa"]}</span></div>'
            f'<div class="meta"><code>{_e(item["id"])}</code> · {_e(item["family"])} {_e(json.dumps(item["params"]))}</div>'
            f'<div class="meta">label: {label} · built: {size} · review: {review}</div>'
            f'<ul class="checks">{checks}</ul>'
            f'<div class="decide">{radios}<input type="text" placeholder="note" '
            f'value="{_e(build.get("reviewNote", ""))}"></div></div>')


def write_build_review(path, catalogue: dict, builds: dict, reviews: dict) -> None:
    items = {i["id"]: i for i in catalogue["items"]}
    entries = sorted(builds["items"], key=lambda b: ({"fail": 0, "unchecked": 1, "pass": 2}[b["qa"]], b["family"], b["id"]))
    verdicts = Counter(b["qa"] for b in entries)
    review_counts = Counter(b["review"] for b in entries)
    by_family: dict[str, Counter] = {}
    for b in entries:
        by_family.setdefault(b["family"], Counter())[b["qa"]] += 1
    family_rows = "".join(f'<tr><td>{_e(f)}</td><td>{sum(c.values())}</td><td>{c["pass"]}</td><td>{c["unchecked"]}</td>'
                          f'<td>{c["fail"]}</td></tr>' for f, c in sorted(by_family.items()))
    options = "".join(f'<option value="{_e(f)}">{_e(f)}</option>' for f in sorted(by_family))
    cards = "".join(_card(items[b["id"]], b) for b in entries)
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Asset Build Review</title>
<style>{_CSS}</style></head><body><main>
<h1>Asset build review</h1>
<p class="muted">Generated by <code>python blender-asset-pipeline/run.py build</code>. Each card shows the board crop, the
built model at {DISPLAY_PX_PER_M} px per metre (same scale on every card), and QA checks (sizes, origin and file size
measured from the exported GLB; triangle count as reported by Blender).
Choose approve / reject, press <b>Download reviews.json</b>, save it as <code>blender-asset-pipeline/data/reviews.json</code>
and run <code>python blender-asset-pipeline/run.py qa</code>.</p>
<table><tr><th>Built</th><th>QA pass</th><th>Size unchecked (no label)</th><th>QA fail</th><th>Build failures</th>
<th>Approved</th><th>Rejected</th><th>Pending</th><th>Stale</th></tr>
<tr><td>{len(entries)}</td><td>{verdicts["pass"]}</td><td>{verdicts["unchecked"]}</td><td>{verdicts["fail"]}</td>
<td>{len(builds["failures"])}</td><td>{review_counts["approved"]}</td><td>{review_counts["rejected"]}</td>
<td>{review_counts["pending"]}</td><td>{review_counts["stale"]}</td></tr></table>
<table><tr><th>Family</th><th>Built</th><th>Pass</th><th>Unchecked</th><th>Fail</th></tr>{family_rows}</table>
<div class="bar"><select id="f-verdict"><option value="">all QA</option><option>fail</option><option>unchecked</option>
<option>pass</option></select><select id="f-family"><option value="">all families</option>{options}</select>
<select id="f-review"><option value="">all reviews</option><option>pending</option><option>approved</option>
<option>rejected</option><option>stale</option></select><button id="export">Download reviews.json</button></div>
<div class="grid">{cards}</div>
<script type="application/json" id="existing">{json.dumps(reviews).replace("</", "<\\/")}</script>
<script>{_JS}</script></main></body></html>"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(page, encoding="utf-8")
