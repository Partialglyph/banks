"""Build testbank/index.html from testbank/questions.md.

Usage:  python testbank/build.py
No dependencies. Math is left as $...$ and rendered in the browser by KaTeX.
Redrawn SVG figures are inlined (so the page theme / dark mode applies);
scan JPGs are shown beside them as <img>.
"""
import html
import re
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "questions.md"
OUT = HERE / "index.html"


# ---------------------------------------------------------------- inline text
def inline(text):
    maths = []

    def stash(m):
        maths.append(m.group(1))
        return f"\x00{len(maths) - 1}\x00"

    text = re.sub(r"\$([^$]+)\$", stash, text)
    text = html.escape(text, quote=False)
    text = re.sub(r"\*\*(\[\d+\])\*\*", r'<span class="mk">\1</span>', text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)

    def em(m):
        body = m.group(1)
        cls = ' class="note"' if body.startswith("(") else ""
        return f"<em{cls}>{body}</em>"

    text = re.sub(r"\*(?!\s)([^*]+?)\*", em, text)
    text = re.sub(r"  +", '<span class="gap"></span>', text)
    return re.sub(
        r"\x00(\d+)\x00",
        lambda m: "$" + html.escape(maths[int(m.group(1))], quote=False) + "$",
        text,
    )


def plain(text):
    return re.sub(r"\s+", " ", re.sub(r"[*$\\{}]|!\[.*?\]\(.*?\)", " ", text)).lower()


# -------------------------------------------------------------------- figures
def svg_markup(path):
    svg = (HERE / path).read_text(encoding="utf8").strip()
    return svg


def figure(images, caption):
    m = re.match(r"\*Figure \((.+?)\):\s*(.*)\*$", caption, re.S)
    fid, cap = (m.group(1), m.group(2)) if m else ("", caption.strip("*"))
    cells = []
    for alt, src in images:
        if src.endswith(".svg"):
            cells.append(
                f'<div class="fig-cell"><div class="fig-svg">{svg_markup(src)}</div>'
                f'<span class="fig-tag">Redrawn</span></div>'
            )
        else:
            cells.append(
                f'<div class="fig-cell"><a href="{src}" target="_blank" rel="noopener">'
                f'<img src="{src}" alt="{html.escape(alt)}" loading="lazy"></a>'
                f'<span class="fig-tag">{html.escape(alt)}</span></div>'
            )
    return (
        f'<figure id="fig-{fid}"><div class="fig-row">{"".join(cells)}</div>'
        f"<figcaption>{inline(cap)}</figcaption></figure>"
    )


# --------------------------------------------------------------------- parse
def parse(md):
    md = re.sub(r"<!--.*?-->", "", md, flags=re.S)
    chapters = []
    ch = paper = q = None
    mode = None  # None | "key"

    for raw in md.splitlines():
        line = raw.rstrip()
        if line.startswith("## "):
            ch = {"title": line[3:], "papers": []}
            chapters.append(ch)
            paper = q = None
            mode = None
        elif line.startswith("### "):
            paper = {"title": line[4:], "meta": [], "items": [], "key": []}
            ch["papers"].append(paper)
            q = None
            mode = None
        elif line.startswith("#### "):
            q = {"title": line[5:], "lines": []}
            paper["items"].append(("q", q))
            mode = None
        elif re.match(r"\*\*Section \d+\*\*$", line):
            paper["items"].append(("section", line.strip("*")))
            q = None
        elif line.startswith("**Answer key"):
            paper["key_title"] = line.strip("*")
            mode = "key"
            q = None
        elif mode == "key":
            if line.startswith("- "):
                paper["key"].append(line[2:])
        elif q is not None:
            q["lines"].append(line)
        elif paper is not None and line.startswith("*") and line.endswith("*"):
            paper["meta"].append(line.strip("*"))
    return chapters


def render_question(q):
    blocks = [b for b in re.split(r"\n\s*\n", "\n".join(q["lines"])) if b.strip()]
    out, pending = [], []
    for b in blocks:
        b = b.strip()
        if b.startswith("!["):
            pending += re.findall(r"!\[(.*?)\]\((.*?)\)", b)
        elif b.startswith("*Figure ("):
            out.append(figure(pending, b))
            pending = []
        elif b.startswith("|"):
            rows = [
                [c.strip() for c in r.strip().strip("|").split("|")]
                for r in b.splitlines()
                if not re.match(r"^\|[-| :]+\|$", r.strip())
            ]
            head, body = rows[0], rows[1:]
            t = "<table><thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head)
            t += "</tr></thead><tbody>"
            t += "".join(
                "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>"
                for r in body
            )
            out.append(t + "</tbody></table>")
        else:
            cls = "p"
            if re.match(r"\([a-z]\) ", b):
                cls = "p part"
            elif re.match(r"(i|ii|iii|iv|v)\. ", b):
                cls = "p sub"
            out.append(f'<p class="{cls}">{inline(b.replace(chr(10), " "))}</p>')
    return "\n".join(out)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def marks_of(lines, ch_idx):
    """Sum the printed **[n]** marks. Unmarked questions get an estimate (flagged)."""
    text = "\n".join(lines)
    ms = [int(x) for x in re.findall(r"\*\*\[(\d+)\]\*\*", text)]
    if ms:
        return sum(ms), False
    text = re.sub(r"\$[^$]*\$", "", text)
    toks = re.findall(r"(?:^|\s)(\([a-z]\)|i{1,3}\.|iv\.)(?=\s)", text, re.M)
    leaves = 0
    for i, t in enumerate(toks):
        nxt = toks[i + 1] if i + 1 < len(toks) else None
        if not t.startswith("(") or not (nxt and not nxt.startswith("(")):
            leaves += 1
    return max(1, leaves) * (1 if ch_idx == 4 else 3), True


def short_title(t):
    return re.sub(r"^Chapter \d+\s*[—-]\s*", "", t)


def build(chapters):
    data = {"chapters": [{"title": short_title(c["title"])} for c in chapters], "questions": []}
    for ci, ch in enumerate(chapters):
        for pi, p in enumerate(ch["papers"], 1):
            sec = ""
            paper_total = 0
            for kind, item in p["items"]:
                if kind == "section":
                    sec = item
                    continue
                num = re.sub(r"[^0-9]", "", item["title"])
                marks, est = marks_of(item["lines"], ci)
                if not est:
                    paper_total += marks
                data["questions"].append({
                    "id": f"c{ci + 1}p{pi}{slug(sec)}q{num}",
                    "ch": ci, "paper": p["title"], "section": sec, "num": int(num),
                    "marks": marks, "est": est,
                    "html": render_question(item),
                    "text": plain(" ".join(item["lines"])),
                })
            print(f"  {p['title']}: {paper_total} printed marks")
    return data


TEMPLATE = (HERE / "template.html").read_text(encoding="utf8")

if __name__ == "__main__":
    import json
    chapters = parse(SRC.read_text(encoding="utf8"))
    data = build(chapters)
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    OUT.write_text(TEMPLATE.replace("{{DATA}}", blob), encoding="utf8")
    n = len(data["questions"])
    print(f"wrote {OUT} - {n} questions, {sum(1 for q in data['questions'] if q['est'])} with estimated marks")
