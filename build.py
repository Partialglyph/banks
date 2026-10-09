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


def build(chapters):
    nav, body = [], []
    total = 0
    for ci, ch in enumerate(chapters, 1):
        cid = f"ch{ci}"
        nav.append(f'<div class="nav-ch"><a href="#{cid}">{html.escape(ch["title"])}</a><ul>')
        body.append(f'<section class="chapter" id="{cid}"><h2>{html.escape(ch["title"])}</h2>')
        for pi, p in enumerate(ch["papers"], 1):
            pid = f"{cid}-p{pi}"
            nq = sum(1 for k, _ in p["items"] if k == "q")
            total += nq
            nav.append(f'<li><a href="#{pid}">{html.escape(p["title"])}</a></li>')
            meta = "".join(f'<p class="meta">{inline(m)}</p>' for m in p["meta"])
            body.append(
                f'<details class="paper" id="{pid}"><summary><span class="ptitle">'
                f'{html.escape(p["title"])}</span><span class="count">{nq} questions</span></summary>{meta}'
            )
            sec = ""
            for kind, item in p["items"]:
                if kind == "section":
                    sec = slug(item)
                    body.append(f'<h4 class="section">{html.escape(item)}</h4>')
                    continue
                qid = f"{pid}-{sec + '-' if sec else ''}q{re.sub(r'[^0-9]', '', item['title'])}"
                inner = render_question(item)
                body.append(
                    f'<article class="q" id="{qid}" data-text="{html.escape(plain(" ".join(item["lines"])), quote=True)}">'
                    f'<header><h3>{html.escape(item["title"])}</h3>'
                    f'<label class="done"><input type="checkbox" data-q="{qid}"> done</label></header>'
                    f"{inner}</article>"
                )
            if p["key"]:
                items = "".join(f"<li>{inline(k)}</li>" for k in p["key"])
                body.append(
                    f'<details class="key"><summary>{inline(p.get("key_title", "Answer key"))}</summary>'
                    f"<ul>{items}</ul></details>"
                )
            body.append("</details>")
        nav.append("</ul></div>")
        body.append("</section>")
    return "\n".join(nav), "\n".join(body), total


TEMPLATE = (HERE / "template.html").read_text(encoding="utf8")

if __name__ == "__main__":
    chapters = parse(SRC.read_text(encoding="utf8"))
    nav, body, total = build(chapters)
    OUT.write_text(
        TEMPLATE.replace("{{NAV}}", nav).replace("{{BODY}}", body).replace("{{TOTAL}}", str(total)),
        encoding="utf8",
    )
    print(f"wrote {OUT} - {len(chapters)} chapters, {total} questions")
