#!/usr/bin/env python3
"""Prepara un .tex "plano" que pandoc entiende, para exportar la tesis a Word.

Uso (lo llaman exportar-docx.sh/.ps1; normalmente no se usa directo):
    python exportar_docx.py DIRECTORIO_PROYECTO

Escribe _docx/tesis-pandoc.tex con:
- todos los \\input resueltos (desde generado/estructura.tex);
- los condicionales \\ifmodoplan / \\ifconhipotesis evaluados según tesis.yaml;
- las macros propias de untels.cls traducidas a LaTeX estándar;
- tipos de columna propios (L, C, Y) convertidos a p{..}/l;
- \\includegraphics con la ruta real del archivo.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

EXT_IMG = (".png", ".jpg", ".jpeg")


def leer(p: Path) -> str:
    if p.suffix != ".tex" and not p.exists():
        p = p.with_suffix(".tex")
    return p.read_text(encoding="utf-8") if p.exists() else f"% [no existe {p}]\n"


def sin_comentarios(t: str) -> str:
    return "\n".join(re.sub(r"(?<!\\)%.*", "", l) for l in t.splitlines())


def resolver_inputs(t: str, raiz: Path, prof: int = 0) -> str:
    if prof > 20:
        return t
    def rep(m):
        return resolver_inputs(sin_comentarios(leer(raiz / m.group(1))), raiz, prof + 1)
    return re.sub(r"\\input\{([^}]+)\}", rep, sin_comentarios(t))


def evaluar_ifs(t: str, flags: dict[str, bool]) -> str:
    """Evalúa \\ifX ... [\\else ...] \\fi para los flags dados (admite anidamiento)."""
    tokens = re.split(r"(\\if(?:modoplan|conhipotesis)\b|\\else\b|\\fi\b)", t)
    salida, pila = [], []          # pila de (activo_padre, cond, en_else)
    activo = True
    for tok in tokens:
        m = re.fullmatch(r"\\if(modoplan|conhipotesis)", tok)
        if m:
            pila.append((activo, flags[m.group(1)], False))
            activo = activo and flags[m.group(1)]
        elif tok == r"\else" and pila:
            padre, cond, _ = pila[-1]
            pila[-1] = (padre, cond, True)
            activo = padre and not cond
        elif tok == r"\fi" and pila:
            activo = pila.pop()[0]
        elif activo:
            salida.append(tok)
    return "".join(salida)


def argumento(t: str, i: int) -> tuple[str, int]:
    """Devuelve el contenido del grupo {..} que empieza en t[i] y el índice final."""
    assert t[i] == "{"
    nivel = 0
    for j in range(i, len(t)):
        if t[j] == "{" and (j == 0 or t[j - 1] != "\\"):
            nivel += 1
        elif t[j] == "}" and t[j - 1] != "\\":
            nivel -= 1
            if nivel == 0:
                return t[i + 1:j], j + 1
    return t[i + 1:], len(t)


def reemplazar_macro(t: str, nombre: str, fn) -> str:
    out, i = [], 0
    patron = re.compile(r"\\" + nombre + r"\s*(?=\{)")
    while True:
        m = patron.search(t, i)
        if not m:
            out.append(t[i:])
            return "".join(out)
        out.append(t[i:m.start()])
        arg, fin = argumento(t, m.end())
        out.append(fn(arg))
        i = fin


def columnas(spec: str) -> str:
    spec = re.sub(r"[LC]\{([^}]*)\}", r"p{\1}", spec)
    spec = spec.replace("Y", "l").replace("X", "l")
    spec = re.sub(r"@\{[^}]*\}", "", spec)
    spec = re.sub(r"\*\{(\d+)\}\{([^{}]*(?:\{[^}]*\})?)\}", lambda m: m.group(2) * int(m.group(1)), spec)
    return spec


def imagen(raiz: Path, nombre: str) -> str:
    for base in (raiz / "figuras", raiz / "figuras/out", raiz):
        for ext in ("",) + EXT_IMG:
            p = base / (nombre + ext)
            if p.is_file() and p.suffix.lower() in EXT_IMG:
                return p.relative_to(raiz).as_posix()
    return nombre


def main() -> int:
    raiz = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    datos = yaml.safe_load((raiz / "tesis.yaml").read_text(encoding="utf-8"))
    meta = datos["meta"]
    flags = {"modoplan": meta["modo"] == "plan", "conhipotesis": bool(meta.get("con_hipotesis", True))}

    macros = "\n".join(l for l in leer(raiz / "generado/meta.tex").splitlines() if l.startswith(r"\newcommand"))
    cuerpo = resolver_inputs(leer(raiz / "generado/estructura.tex"), raiz)
    cuerpo = evaluar_ifs(cuerpo, flags)

    for nombre, fn in {
        "capitulosinnumero": lambda a: rf"\chapter*{{{a}}}",
        "paginapreliminar": lambda a: rf"\chapter*{{{a}}}",
        "anexo": lambda a: rf"\section*{{{a}}}",
        "nota": lambda a: rf"\par\emph{{Nota.}} {a}\par",
        "caption": lambda a: rf"\caption{{{a}}}",
    }.items():
        cuerpo = reemplazar_macro(cuerpo, nombre, fn)
    cuerpo = re.sub(r"\\(iniciopreliminares|iniciocuerpo|clearpage|newpage|vfill|medskip|smallskip|bigskip)\b", "", cuerpo)
    cuerpo = re.sub(r"\\pagenumbering\{[^}]*\}|\\thispagestyle\{[^}]*\}", "", cuerpo)
    cuerpo = re.sub(r"\\(begin|end)\{landscape\}", "", cuerpo)
    cuerpo = re.sub(r"\\printbibliography(\[[^\]]*\])?", "", cuerpo)
    cuerpo = re.sub(r"\\(tableofcontents|listoftables|listoffigures)\b", "", cuerpo)
    cuerpo = re.sub(r"\\begin\{tabularx\}\{[^}]*\}\{", r"\\begin{tabular}{", cuerpo)
    cuerpo = cuerpo.replace(r"\end{tabularx}", r"\end{tabular}")
    cuerpo = re.sub(r"\\begin\{(tabular|longtable)\}\{", lambda m: m.group(0) + "\x01", cuerpo)
    cuerpo = re.sub(r"\x01([^\n]*?)\}(?=\s*(\n|\\caption|$))",
                    lambda m: columnas(m.group(1)) + "}", cuerpo)
    cuerpo = cuerpo.replace("\x01", "")
    cuerpo = re.sub(r"\\includegraphics(\[[^\]]*\])?\{([^}]+)\}",
                    lambda m: rf"\includegraphics{m.group(1) or ''}{{{imagen(raiz, m.group(2))}}}", cuerpo)

    doc = "\n".join([
        r"\documentclass{report}",
        r"\usepackage{graphicx,booktabs,longtable,multirow,amsmath}",
        macros,
        r"\begin{document}",
        cuerpo,
        r"\end{document}",
    ])
    destino = raiz / "_docx"
    destino.mkdir(exist_ok=True)
    (destino / "tesis-pandoc.tex").write_text(doc, encoding="utf-8", newline="\n")
    print(f"Preparado {destino / 'tesis-pandoc.tex'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
