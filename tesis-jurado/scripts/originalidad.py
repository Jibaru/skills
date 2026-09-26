#!/usr/bin/env python3
"""Chequeo aproximado de originalidad del texto de la tesis contra las fuentes locales.

Compara los capítulos (.tex) con los PDFs de literatura/pdfs/ (y fuentes extra) usando
n-gramas de palabras normalizadas. Detecta pasajes poco parafraseados ANTES de Turnitin.

Qué se excluye del texto de la tesis (como el filtro de Turnitin "excluir citas"):
  - comentarios, comandos y matemática de LaTeX; \\cite, \\textcite, \\parencite, \\ref, \\label
  - citas textuales entre comillas ("…", «…», ``…'', \\enquote{…}) y entornos quote,
    quotation, displayquote
  - la bibliografía (solo se leen capitulos/*.tex y los .tex pasados con --tex)

Es una cota inferior: Turnitin compara contra internet, repositorios y trabajos
entregados, que aquí no están. Un 8 % aquí puede ser 15 % en Turnitin.

Uso:
  python originalidad.py --proyecto RUTA [--tex OTRO.tex ...] [--fuente EXTRA.pdf|.docx|.txt ...]
                         [--n 8] [--meta 15] [--salida revisiones/AAAA-MM-DD-originalidad.md]
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

# ------------------------------------------------------------ normalización ---

PALABRA = re.compile(r"[a-z0-9]+")


def normalizar(texto: str) -> str:
    t = unicodedata.normalize("NFKD", texto.lower())
    return "".join(c for c in t if not unicodedata.combining(c))


def tokens(texto: str) -> list[str]:
    return PALABRA.findall(normalizar(texto))


# ------------------------------------------------------------ limpieza LaTeX ---

def _vaciar(m: re.Match) -> str:
    """Reemplaza el match por espacios conservando los saltos de línea (para numerar)."""
    return re.sub(r"[^\n]", " ", m.group(0))


ENTORNOS_FUERA = r"quote|quotation|displayquote|verbatim|lstlisting|minted|equation\*?|align\*?|tabular\*?|longtable"
COMANDOS_FUERA = (r"\\(?:[a-zA-Z]*cite[a-zA-Z]*|ref|autoref|cref|Cref|eqref|label|input|include|"
                  r"includegraphics|url|href|bibliography|addbibresource|printbibliography|"
                  r"addcontentsline|vspace|hspace|setlength|newcommand|renewcommand)\*?"
                  r"(?:\s*\[[^\]]*\])*(?:\s*\{[^{}]*\})*")


def limpiar_tex(src: str, excluir_citas: bool = True) -> str:
    s = re.sub(r"(?<!\\)%[^\n]*", "", src)  # comentarios
    s = re.sub(rf"\\begin\{{({ENTORNOS_FUERA})\}}.*?\\end\{{\1\}}", _vaciar, s, flags=re.S)
    s = re.sub(r"\$\$.*?\$\$|\\\[.*?\\\]|\$[^$]*\$|\\\(.*?\\\)", _vaciar, s, flags=re.S)
    s = re.sub(COMANDOS_FUERA, _vaciar, s)
    if excluir_citas:
        s = re.sub(r"\\enquote\*?\{[^{}]*\}", _vaciar, s)
        s = re.sub(r"``.*?''|\"[^\"\n]*(?:\n[^\"\n]*){0,6}\"|«.*?»|“.*?”", _vaciar, s, flags=re.S)
    s = re.sub(r"\\[a-zA-Z@]+\*?(?:\s*\[[^\]]*\])?", " ", s)  # \comando → deja su argumento
    s = re.sub(r"[{}~\\&]", " ", s)
    return s


def leer_tesis(archivos: list[Path], raiz: Path, excluir_citas: bool):
    """Devuelve tokens normalizados, índice de la palabra original de cada token,
    la lista de palabras originales y (archivo, línea) por token."""
    norm, orig, raws, pos = [], [], [], []
    for f in archivos:
        texto = limpiar_tex(f.read_text(encoding="utf-8", errors="replace"), excluir_citas)
        rel = f.relative_to(raiz) if f.is_relative_to(raiz) else f
        for nlinea, linea in enumerate(texto.split("\n"), 1):
            for m in re.finditer(r"\S+", linea):
                raws.append(m.group(0))
                for t in tokens(m.group(0)):
                    norm.append(t)
                    orig.append(len(raws) - 1)
                    pos.append((str(rel).replace("\\", "/"), nlinea))
    return norm, orig, raws, pos


# ------------------------------------------------------------------ fuentes ---

def ruta_larga(ruta: Path) -> str:
    r"""En Windows, prefijo \\?\ para rutas de más de 260 caracteres."""
    r = str(ruta.resolve())
    return "\\\\?\\" + r if os.name == "nt" and len(r) >= 250 and not r.startswith("\\\\") else r


def texto_fuente(ruta: Path, cache: Path) -> list[tuple[int, list[str]]]:
    """[(página, tokens)] con caché por hash del archivo."""
    with open(ruta_larga(ruta), "rb") as fh:
        datos = fh.read()
    h = hashlib.sha1(datos).hexdigest()[:16]
    c = cache / f"{h}.json"
    if c.exists():
        return [(p, t) for p, t in json.loads(c.read_text(encoding="utf-8"))]
    paginas: list[tuple[int, str]] = []
    suf = ruta.suffix.lower()
    if suf == ".pdf":
        import pymupdf
        with pymupdf.open(stream=datos, filetype="pdf") as d:
            paginas = [(i + 1, pg.get_text()) for i, pg in enumerate(d)]
    elif suf == ".docx":
        import docx
        import io
        paginas = [(1, "\n".join(p.text for p in docx.Document(io.BytesIO(datos)).paragraphs))]
    else:
        paginas = [(1, datos.decode("utf-8", errors="replace"))]
    res = [(p, tokens(re.sub(r"-\s*\n\s*", "", t))) for p, t in paginas]  # une guiones de corte
    cache.mkdir(parents=True, exist_ok=True)
    c.write_text(json.dumps(res), encoding="utf-8")
    return res


# ---------------------------------------------------------------- análisis ---

def analizar(norm, fuentes: dict[str, list[tuple[int, list[str]]]], n: int):
    indice = defaultdict(list)
    for i in range(len(norm) - n + 1):
        indice[tuple(norm[i:i + n])].append(i)
    cubre = defaultdict(set)       # fuente -> posiciones de la tesis cubiertas
    pagina = {}                    # (fuente, pos) -> página de la fuente
    for nombre, paginas in fuentes.items():
        flat, pags = [], []
        for p, t in paginas:
            flat += t
            pags += [p] * len(t)
        for j in range(len(flat) - n + 1):
            clave = tuple(flat[j:j + n])
            if clave in indice:
                for i in indice[clave]:
                    for k in range(i, i + n):
                        cubre[nombre].add(k)
                        pagina.setdefault((nombre, k), pags[j])
    return cubre, pagina


def pasajes(cubre, pagina, n):
    out = []
    for fuente, ps in cubre.items():
        orden = sorted(ps)
        ini = prev = orden[0]
        for p in orden[1:] + [None]:
            if p is not None and p == prev + 1:
                prev = p
                continue
            if prev - ini + 1 >= n:
                out.append((fuente, ini, prev, pagina.get((fuente, ini))))
            if p is not None:
                ini = prev = p
    return sorted(out, key=lambda x: x[2] - x[1], reverse=True)


def main(argv=None):
    for st in (sys.stdout, sys.stderr):
        try:
            st.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--proyecto", default=".")
    ap.add_argument("--tex", action="append", default=[], help="archivos .tex adicionales o en lugar de capitulos/")
    ap.add_argument("--solo-tex", action="store_true", help="no leer capitulos/*.tex, solo --tex")
    ap.add_argument("--fuente", action="append", default=[], help="PDF, DOCX o TXT extra (o carpeta)")
    ap.add_argument("--sin-literatura", action="store_true", help="no usar literatura/pdfs/")
    ap.add_argument("--n", type=int, default=8, help="tamaño del n-grama en palabras (por defecto 8)")
    ap.add_argument("--meta", type=float, default=15.0, help="similitud máxima aceptable en %% (rúbrica: 15)")
    ap.add_argument("--incluir-citas", action="store_true", help="no excluir citas textuales entre comillas")
    ap.add_argument("--max-pasajes", type=int, default=40)
    ap.add_argument("--salida", help="ruta del informe .md (por defecto revisiones/AAAA-MM-DD-originalidad.md)")
    a = ap.parse_args(argv)

    raiz = Path(a.proyecto).resolve()
    archivos = [] if a.solo_tex else sorted((raiz / "capitulos").glob("*.tex"))
    archivos += [Path(t).resolve() for t in a.tex]
    if not archivos:
        sys.exit("No hay .tex que revisar (capitulos/*.tex o --tex).")
    norm, orig, raws, pos = leer_tesis(archivos, raiz, not a.incluir_citas)
    if len(norm) < a.n:
        sys.exit("El texto es demasiado corto para comparar.")

    rutas: list[Path] = []
    if not a.sin_literatura and (raiz / "literatura" / "pdfs").exists():
        rutas += sorted((raiz / "literatura" / "pdfs").rglob("*.pdf"))
    for f in a.fuente:
        p = Path(f).resolve()
        rutas += sorted(x for x in p.rglob("*") if x.suffix.lower() in (".pdf", ".docx", ".txt")) if p.is_dir() else [p]
    if not rutas:
        sys.exit("No hay fuentes para comparar (literatura/pdfs/ vacía y sin --fuente).")

    cache = raiz / "literatura" / ".cache"
    fuentes = {}
    for r in rutas:
        try:
            fuentes[r.name] = texto_fuente(r, cache)
        except Exception as e:  # noqa: BLE001
            print(f"AVISO: no se pudo leer {r.name}: {e}", file=sys.stderr)

    cubre, pagina = analizar(norm, fuentes, a.n)
    total = len(norm)
    todas = set().union(*cubre.values()) if cubre else set()
    pct = 100 * len(todas) / total
    por_fuente = sorted(((f, 100 * len(ps) / total) for f, ps in cubre.items()), key=lambda x: -x[1])
    ps = pasajes(cubre, pagina, a.n)

    hoy = dt.date.today().isoformat()
    estado = "DENTRO DE LA META" if pct < a.meta else "SUPERA LA META"
    L = [f"# Chequeo de originalidad — {hoy}", "",
         f"**Similitud aproximada: {pct:.1f} %** (meta < {a.meta:g} %) — {estado}", "",
         f"- Palabras analizadas: {total} en {len(archivos)} archivo(s); fuentes comparadas: {len(fuentes)}",
         f"- n-grama: {a.n} palabras; citas textuales entre comillas "
         f"{'incluidas' if a.incluir_citas else 'excluidas'}; bibliografía excluida.",
         "- Es una **cota inferior**: Turnitin también compara contra internet, repositorios y "
         "trabajos entregados. Tómalo como alerta temprana, no como el porcentaje oficial.", "",
         "## Similitud por fuente", "", "| Fuente | % |", "|---|---|"]
    L += [f"| {f} | {v:.1f} |" for f, v in por_fuente[:25]] or ["| (sin coincidencias) | 0 |"]
    L += ["", "## Pasajes coincidentes (de mayor a menor)", "",
          "Parafrasea la **idea** con tu propio argumento y cita. No basta con cambiar palabras por "
          "sinónimos. Si necesitas el texto literal, ponlo entre comillas con la página.", ""]
    for k, (fuente, i, j, pag) in enumerate(ps[:a.max_pasajes], 1):
        arch, lin = pos[i]
        texto = " ".join(raws[r] for r in dict.fromkeys(orig[i:j + 1]))
        L += [f"{k}. **{arch}:{lin}** — {j - i + 1} palabras — {fuente}, p. {pag}", "",
              f"   > {texto[:600]}{'…' if len(texto) > 600 else ''}", ""]
    if len(ps) > a.max_pasajes:
        L.append(f"(… {len(ps) - a.max_pasajes} pasajes más; usa --max-pasajes)")
    informe = "\n".join(L) + "\n"

    salida = Path(a.salida) if a.salida else raiz / "revisiones" / f"{hoy}-originalidad.md"
    salida = salida if salida.is_absolute() else raiz / salida
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(informe, encoding="utf-8")
    print(f"Similitud aproximada: {pct:.1f} % ({estado}); {len(ps)} pasajes. Informe: {salida}")


if __name__ == "__main__":
    main()
