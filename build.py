"""Build testbank/index.html from questions.md (Grade 11) and gr12/questions.md (Grade 12).

Usage:  python testbank/build.py
No dependencies. Math is left as $...$ and rendered in the browser by KaTeX.
Redrawn SVG figures are inlined (so the page theme / dark mode applies);
scan JPGs are shown beside them as <img>.
"""
import html
import re
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "index.html"
# (grade, markdown file, folder its figures/ paths are relative to, question-id prefix)
SOURCES = [("11", "questions.md", "", ""), ("12", "gr12/questions.md", "gr12/", "g12")]
FIG_BASE = ""      # set per source while rendering
MISSING = []       # figure files referenced but not present


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
        cls = ' class="note"' if body[:1] in "([" else ""
        return f"<em{cls}>{body}</em>"

    text = re.sub(r"\*(?!\s)([^*]+?)\*", em, text)
    text = re.sub(r"\{((?:[MARN]\d)|AG)\}", r'<span class="ms">\1</span>', text)
    text = re.sub(r"  +", '<span class="gap"></span>', text)
    return re.sub(
        r"\x00(\d+)\x00",
        lambda m: "$" + html.escape(maths[int(m.group(1))], quote=False) + "$",
        text,
    )


def copy_text(lines, num, marks, est):
    """The question as pasteable text: LaTeX math kept as $...$, figures as [Figure: caption]."""
    maths = []

    def stash(m):
        maths.append(m.group(0))
        return f"\x00{len(maths) - 1}\x00"

    out = []
    for line in lines:
        line = re.sub(r"\$[^$]+\$", stash, line)
        if re.fullmatch(r"\s*!\[.*?\]\(.*?\)\s*", line):
            continue
        m = re.fullmatch(r"\*Figure \(.+?\):\s*(.*)\*", line.strip())
        if m:
            line = f"[Figure: {m.group(1)}]"
        line = re.sub(r"\*\*(.+?)\*\*", r"\1", line)
        line = re.sub(r"\*(?!\s)([^*]+?)\*", r"\1", line)
        out.append(line)
    body = re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()
    body = re.sub(r"\x00(\d+)\x00", lambda m: maths[int(m.group(1))], body)
    return f"Question {num} ({'~' if est else ''}{marks} marks)\n\n{body}"


def plain(text):
    return re.sub(r"\s+", " ", re.sub(r"[*$\\{}]|!\[.*?\]\(.*?\)", " ", text)).lower()


# -------------------------------------------------------------------- figures
def svg_markup(path):
    return (HERE / path).read_text(encoding="utf8").strip()


def figure(images, caption):
    m = re.match(r"\*Figure \((.+?)\):\s*(.*)\*$", caption, re.S)
    fid, cap = (m.group(1), m.group(2)) if m else ("", caption.strip("*"))
    cells = []
    for alt, src in images:
        src = FIG_BASE + src
        if not (HERE / src).exists():
            MISSING.append(src)
            cells.append(
                f'<div class="fig-cell"><div class="fig-missing">Figure not available yet</div>'
                f'<span class="fig-tag">{html.escape(alt)}</span></div>'
            )
        elif src.endswith(".svg"):
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
        f'<figure data-fig="{fid}"><div class="fig-row">{"".join(cells)}</div>'
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
        if re.fullmatch(r"\[\d+\]", line.strip()):  # bare mark allocation on its own line
            line = f"**{line.strip()}**"
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
        elif all(l.startswith("- ") for l in b.splitlines()):
            out.append("<ul>" + "".join(f"<li>{inline(l[2:])}</li>" for l in b.splitlines()) + "</ul>")
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


def marks_of(lines, per_leaf):
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
    return max(1, leaves) * per_leaf, True


def short_title(t):
    return re.sub(r"^Chapter [\d–-]+\s*[—-]\s*", "", t)


def build():
    global FIG_BASE
    data = {"chapters": [], "questions": []}
    for grade, md, base, prefix in SOURCES:
        FIG_BASE = base
        for ch in parse((HERE / md).read_text(encoding="utf8")):
            ci = len(data["chapters"])
            title = short_title(ch["title"])
            data["chapters"].append({"title": title, "grade": grade})
            local = sum(1 for c in data["chapters"] if c["grade"] == grade)  # 1-based within the grade
            per_leaf = 1 if "Probability" in title else 3
            for pi, p in enumerate(ch["papers"], 1):
                sec = ""
                paper_total = 0
                for kind, item in p["items"]:
                    if kind == "section":
                        sec = item
                        continue
                    num = re.sub(r"[^0-9]", "", item["title"])
                    marks, est = marks_of(item["lines"], per_leaf)
                    if not est:
                        paper_total += marks
                    before = len(MISSING)
                    html_ = render_question(item)
                    data["questions"].append({
                        "id": f"{prefix}c{local}p{pi}{slug(sec)}q{num}",
                        "ch": ci, "paper": p["title"], "section": sec, "num": int(num),
                        "marks": marks, "est": est, "nofig": len(MISSING) > before,
                        "html": html_,
                        "text": plain(" ".join(item["lines"])),
                        "copy": copy_text(item["lines"], int(num), marks, est),
                    })
                print(f"  Gr{grade} {p['title']}: {paper_total} printed marks")
    return data


ANSWER_FILES = ["answers/gr11.md", "answers/gr12.md"]


def load_answers():
    """{question id: list of lines} from the answer files."""
    out, cur = {}, None
    for f in ANSWER_FILES:
        path = HERE / f
        if not path.exists():
            continue
        md = re.sub(r"<!--.*?-->", "", path.read_text(encoding="utf8"), flags=re.S)
        for line in md.splitlines():
            if line.startswith("## "):
                cur = line[3:].strip()
                out[cur] = []
            elif cur is not None and not line.startswith("# "):
                out[cur].append(line.rstrip())
    return out


def scheme_marks(lines):
    text = re.sub(r"\$[^$]*\$", "", "\n".join(lines))
    return sum(int(n) for n in re.findall(r"\{[MARN](\d)\}", text))


def attach_answers(data):
    answers = load_answers()
    ids = {q["id"] for q in data["questions"]}
    for q in data["questions"]:
        lines = answers.get(q["id"])
        if not lines:
            continue
        q["ans"] = render_question({"lines": lines})
        got = scheme_marks(lines)
        if not q["est"] and got != q["marks"]:
            print(f"  markscheme total {got} != {q['marks']} printed: {q['id']}")
    missing = [q["id"] for q in data["questions"] if "ans" not in q]
    extra = sorted(set(answers) - ids)
    print(f"answers: {len(data['questions']) - len(missing)} attached, {len(missing)} missing"
          + (f" ({' '.join(missing)})" if missing else "") + (f", unknown ids: {' '.join(extra)}" if extra else ""))


TEMPLATE = (HERE / "template.html").read_text(encoding="utf8")

if __name__ == "__main__":
    import json
    data = build()
    attach_answers(data)
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    OUT.write_text(TEMPLATE.replace("{{DATA}}", blob), encoding="utf8")
    qs = data["questions"]
    for g in ("11", "12"):
        gq = [q for q in qs if data["chapters"][q["ch"]]["grade"] == g]
        print(f"Grade {g}: {len(gq)} questions, {sum(q['est'] for q in gq)} estimated, {sum(q['nofig'] for q in gq)} missing a figure")
    if MISSING:
        print(f"missing figure files ({len(MISSING)}): " + " ".join(sorted(set(MISSING))))
    print(f"wrote {OUT}")
