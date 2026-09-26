#!/usr/bin/env python3
"""Gestiona bib/referencias.bib (biblatex + biblatex-apa) con referencias verificadas.

  python bib.py doi 10.3390/s22176482 [10.1109/...] [--proyecto RUTA] [--clave K]
      crea la entrada desde los metadatos de Crossref (tras comprobar que el DOI existe)
  python bib.py isbn 9780262035613 [--clave K]
      libro desde Open Library (revisa autores y año: Open Library a veces da la reimpresión)
  python bib.py tesis --autor "Apellido Apellido, Nombre" --anio 2025 --titulo "..." \
      --universidad "Universidad César Vallejo" --grado pregrado --url https://hdl.handle.net/...
  python bib.py web --autor "{{Instituto Geofísico del Perú}}" --anio 2023 --titulo "..." \
      --sitio "IGP" --url https://... [--fecha 2023-05-21]
  python bib.py desde-fichas
      crea entradas para todas las fichas de literatura/fichas/ (DOI -> Crossref; tesis sin DOI
      -> @thesis con los datos de la ficha) y escribe la clave en el campo bibkey de cada ficha
  python bib.py check
      cruza las citas de capitulos/*.tex con el .bib, verifica cada DOI en doi.org y
      aplica las validaciones APA 7 en español (ver SKILL.md)

Nada se inventa: si un DOI no resuelve o Crossref no tiene el registro, el comando falla
y no escribe la entrada.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

MAILTO = os.environ.get("TESIS_MAILTO", "")
UA = f"Mozilla/5.0 (compatible; tesis-referencias/1.0; +https://github.com/Jibaru/skills{'; mailto:' + MAILTO if MAILTO else ''})"
VACIAS = {"a", "an", "the", "of", "on", "in", "for", "and", "to", "with", "el", "la", "los", "las", "de",
          "del", "en", "y", "un", "una", "para", "por", "al", "using", "based"}
ORDEN_CAMPOS = ["author", "editor", "date", "title", "subtitle", "journaltitle", "booktitle", "volume",
                "number", "pages", "eid", "edition", "publisher", "institution", "type", "eventtitle",
                "venue", "doi", "url", "isbn", "urldate", "langid", "keywords"]


# ------------------------------------------------------------ utilidades

def http_json(url, params=None, accept="application/json"):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8"))


def norm_doi(d):
    d = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*)", "", (d or "").strip(), flags=re.I)
    return d.lower().rstrip(".")


def doi_existe(doi, cache):
    doi = norm_doi(doi)
    if doi in cache:
        return cache[doi]
    try:
        ok = http_json(f"https://doi.org/api/handles/{urllib.parse.quote(doi)}").get("responseCode") == 1
    except urllib.error.HTTPError as e:
        ok = False if e.code == 404 else None
    except Exception:
        ok = None  # sin red: no se puede afirmar nada
    if ok is not None:
        cache[doi] = ok
    return ok


def sin_acentos(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def clave_para(apellido, anio, titulo, existentes):
    ape = re.sub(r"[^a-z]", "", sin_acentos((apellido or "anonimo").split()[0].lower())) or "anonimo"
    palabra = next((w for w in re.findall(r"[a-z0-9]+", sin_acentos(titulo.lower())) if w not in VACIAS), "x")
    base = f"{ape}{anio or 'sf'}{palabra}"
    clave, n = base, 0
    while clave in existentes:
        n += 1
        clave = base + "abcdefghijklmnopqrstuvwxyz"[n - 1]
    return clave


def escapar(v):
    return str(v).replace("&", r"\&").replace("%", r"\%").replace("#", r"\#").replace("_", r"\_")


def detectar_idioma(titulo, dado=""):
    if dado:
        return {"es": "spanish", "en": "english", "pt": "portuguese"}.get(dado[:2].lower(), "english")
    t = f" {sin_acentos(titulo.lower())} "
    espanol = sum(t.count(f" {w} ") for w in ("de", "la", "el", "en", "y", "para", "los", "las", "del", "con", "una", "un"))
    return "spanish" if espanol >= 2 or re.search(r"[áéíóúñ¿¡]", titulo.lower()) else "english"


def proteger(titulo):
    """biblatex-apa pasa los títulos en inglés a tipo oración: protege siglas y marcas (IEEE, WhatsApp, ChatGPT)."""
    def envolver(m):
        w = m.group(0)
        if m.start() and titulo[m.start() - 1] in "{\\":  # ya protegido o es un comando LaTeX
            return w
        return "{" + w + "}" if sum(c.isupper() for c in w) >= 2 or re.match(r"[a-z]+[A-Z]", w) else w
    return re.sub(r"\b[A-Za-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b", envolver, titulo)


def autor_cli(autor):
    """'{{Org}}' o 'Org' sin coma -> '{Org}' (corporativo); 'Ape, Nom and Ape, Nom' se deja igual."""
    limpio = autor.strip()
    while limpio.startswith("{") and limpio.endswith("}"):
        limpio = limpio[1:-1].strip()
    return limpio if ("," in limpio or " and " in limpio) else "{" + limpio + "}"


# ------------------------------------------------------------ archivo .bib

def ruta_bib(proyecto):
    p = Path(proyecto) / "bib" / "referencias.bib"
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        p.write_text("% Referencias de la tesis (biblatex, style=apa). Gestionado con tesis-referencias/scripts/bib.py\n\n",
                     encoding="utf-8")
    return p


def leer_bib(path):
    """Devuelve {clave: (tipo, {campo: valor})} con un parser tolerante de llaves."""
    texto = path.read_text(encoding="utf-8")
    entradas = {}
    for m in re.finditer(r"@(\w+)\s*\{\s*([^,\s]+)\s*,", texto):
        tipo, clave, i = m.group(1).lower(), m.group(2), m.end()
        prof, j = 1, i
        while j < len(texto) and prof:
            prof += {"{": 1, "}": -1}.get(texto[j], 0)
            j += 1
        cuerpo, campos = texto[i:j - 1], {}
        for f in re.finditer(r"(\w+)\s*=\s*", cuerpo):
            k, v0 = f.group(1).lower(), f.end()
            if v0 < len(cuerpo) and cuerpo[v0] == "{":
                prof, v = 1, v0 + 1
                while v < len(cuerpo) and prof:
                    prof += {"{": 1, "}": -1}.get(cuerpo[v], 0)
                    v += 1
                campos.setdefault(k, cuerpo[v0 + 1:v - 1])
            else:
                campos.setdefault(k, re.match(r"[^,\n]*", cuerpo[v0:]).group(0).strip().strip('"'))
        entradas[clave] = (tipo, campos)
    return entradas


def formatear(tipo, clave, campos):
    orden = [k for k in ORDEN_CAMPOS if campos.get(k)] + sorted(k for k in campos if k not in ORDEN_CAMPOS and campos[k])
    lineas = [f"@{tipo}{{{clave},"] + [f"  {k:<13}= {{{campos[k]}}}," for k in orden] + ["}"]
    return "\n".join(lineas) + "\n\n"


def agregar(path, tipo, campos, clave=None, apellido="", titulo=""):
    existentes = leer_bib(path)
    doi = norm_doi(campos.get("doi", ""))
    for k, (_, c) in existentes.items():
        if doi and norm_doi(c.get("doi", "")) == doi:
            print(f"ya existe: {k} (mismo DOI)")
            return k
        if titulo and re.sub(r"\W", "", c.get("title", "").lower()) == re.sub(r"\W", "", titulo.lower()):
            print(f"ya existe: {k} (mismo título)")
            return k
    clave = clave or clave_para(apellido, (campos.get("date") or "")[:4], titulo, existentes)
    with path.open("a", encoding="utf-8") as f:
        f.write(formatear(tipo, clave, campos))
    print(f"añadida: {clave}")
    return clave


# ------------------------------------------------------------ fuentes

def nombres(personas):
    out = []
    for a in personas or []:
        if a.get("family"):
            out.append(f"{a['family']}, {a.get('given', '')}".strip(", "))
        elif a.get("name"):
            out.append("{" + a["name"] + "}")  # autor corporativo: llaves dobles al envolver
    return " and ".join(out)


def desde_doi(doi, cache):
    doi = norm_doi(doi)
    if doi_existe(doi, cache) is False:
        raise SystemExit(f"ERROR: el DOI {doi} no existe en doi.org. No se añade.")
    try:
        it = http_json(f"https://api.crossref.org/works/{urllib.parse.quote(doi)}",
                       {"mailto": MAILTO} if MAILTO else None)["message"]
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        return desde_datacite(doi)
    partes = ((it.get("issued") or it.get("published") or {}).get("date-parts") or [[None]])[0]
    fecha = "-".join(f"{x:02d}" if i else str(x) for i, x in enumerate(p for p in partes if p)) if partes[0] else ""
    titulo = re.sub(r"<[^>]+>", "", " ".join(it.get("title") or [""]))
    sub = " ".join(it.get("subtitle") or [])
    t = it.get("type", "")
    campos = {"author": nombres(it.get("author")), "editor": nombres(it.get("editor")) if t == "book" else "",
              "date": fecha, "title": proteger(escapar(titulo)) if detectar_idioma(titulo, it.get("language", "")) == "english" else escapar(titulo), "subtitle": escapar(sub) if sub and sub.lower() not in titulo.lower() else "",
              "doi": doi, "langid": detectar_idioma(titulo, it.get("language", ""))}
    contenedor = escapar((it.get("container-title") or [""])[0])
    if t in ("journal-article", "posted-content"):
        tipo = "article"
        campos.update(journaltitle=contenedor or escapar(it.get("institution", [{}])[0].get("name", "") if it.get("institution") else ""),
                      volume=it.get("volume", ""), number=it.get("issue", ""),
                      pages=(it.get("page") or "").replace("-", "--"), eid=it.get("article-number", ""))
    elif t in ("proceedings-article",):
        tipo = "inproceedings"
        campos.update(booktitle=contenedor, pages=(it.get("page") or "").replace("-", "--"),
                      publisher=escapar(it.get("publisher", "")))
    elif t in ("book-chapter", "book-section", "reference-entry"):
        tipo = "incollection"
        campos.update(booktitle=contenedor, pages=(it.get("page") or "").replace("-", "--"),
                      publisher=escapar(it.get("publisher", "")))
    elif t in ("book", "monograph", "edited-book", "reference-book"):
        tipo = "book"
        campos.update(publisher=escapar(it.get("publisher", "")), edition=it.get("edition-number", ""))
    elif t == "dissertation":
        tipo = "thesis"
        campos.update(institution=escapar((it.get("institution") or [{}])[0].get("name", "")), type="phdthesis")
    else:
        tipo = "online"
        campos.update(url=f"https://doi.org/{doi}")
    ape = (it.get("author") or [{}])[0].get("family") or (it.get("author") or [{}])[0].get("name", "")
    return tipo, {k: v for k, v in campos.items() if v}, ape, titulo


def desde_datacite(doi):
    """DOIs que no son de Crossref: arXiv (10.48550), Zenodo, repositorios (DataCite)."""
    try:
        at = http_json(f"https://api.datacite.org/dois/{urllib.parse.quote(doi)}")["data"]["attributes"]
    except urllib.error.HTTPError:
        raise SystemExit(f"ERROR: ni Crossref ni DataCite tienen {doi}. Añádelo con 'web' usando la página oficial.")
    autores = []
    for c in at.get("creators") or []:
        if c.get("familyName"):
            autores.append(f"{c['familyName']}, {c.get('givenName', '')}".strip(", "))
        elif c.get("name"):
            autores.append("{" + c["name"] + "}" if c.get("nameType") == "Organizational" else c["name"])
    titulo = (at.get("titles") or [{}])[0].get("title", "")
    lang = detectar_idioma(titulo, at.get("language") or "")
    campos = {"author": " and ".join(autores), "date": str(at.get("publicationYear", "")),
              "title": proteger(escapar(titulo)) if lang == "english" else escapar(titulo),
              "doi": doi, "langid": lang}
    general = ((at.get("types") or {}).get("resourceTypeGeneral") or "").lower()
    if doi.startswith("10.48550/arxiv."):
        tipo = "online"
        campos.update(eprinttype="arxiv", eprint=doi.split("arxiv.", 1)[1], organization="arXiv")
    elif general in ("dissertation",):
        tipo = "thesis"
        campos.update(institution=escapar(at.get("publisher", "")), type="phdthesis")
    elif general in ("text", "journalarticle", "preprint"):
        tipo = "online"
        campos.update(organization=escapar(at.get("publisher", "")))
    else:
        tipo = "misc"
        campos.update(publisher=escapar(at.get("publisher", "")))
    ape = autores[0].strip("{}").split(",")[0] if autores else ""
    return tipo, {k: v for k, v in campos.items() if v}, ape, titulo


def desde_isbn(isbn):
    isbn = re.sub(r"[^0-9Xx]", "", isbn)
    try:
        ed = http_json(f"https://openlibrary.org/isbn/{isbn}.json")
    except urllib.error.HTTPError:
        raise SystemExit(f"ERROR: Open Library no tiene el ISBN {isbn}. Añádelo a mano con los datos de la página del editor.")
    claves = [a["key"] for a in ed.get("authors") or []]
    if not claves and ed.get("works"):
        obra = http_json(f"https://openlibrary.org{ed['works'][0]['key']}.json")
        claves = [a["author"]["key"] for a in obra.get("authors") or []]
    autores = []
    for k in claves:
        n = http_json(f"https://openlibrary.org{k}.json").get("name", "")
        partes = n.split()
        autores.append(f"{partes[-1]}, {' '.join(partes[:-1])}" if len(partes) > 1 else n)
    anio = (re.search(r"\d{4}", ed.get("publish_date", "")) or re.search(r"", "")).group(0)
    titulo = ed.get("title", "")
    campos = {"author": " and ".join(autores), "date": anio, "title": escapar(titulo),
              "subtitle": escapar(ed.get("subtitle", "") or ""), "publisher": escapar(", ".join(ed.get("publishers") or [])),
              "isbn": isbn, "langid": detectar_idioma(titulo)}
    print("AVISO: verifica autor, año y edición contra la portada del libro (Open Library a veces registra reimpresiones).")
    return "book", {k: v for k, v in campos.items() if v}, (autores[0].split(",")[0] if autores else ""), titulo


# ------------------------------------------------------------ check

RE_CITA = re.compile(r"\\(?:[a-zA-Z]*cites?[a-zA-Z]*)\*?")
RE_GRUPO = re.compile(r"\s*(\[[^\]]*\]|\([^)]*\)|\{([^}]*)\})")


def claves_de(texto):
    r"""Claves de \cite, \textcite, \parencite[..][..]{..} y multicitas \parencites{a}{b}."""
    for m in RE_CITA.finditer(texto):
        i, grupos = m.end(), []
        while True:
            g = RE_GRUPO.match(texto, i)
            if not g:
                break
            if g.group(2) is not None:
                grupos.append(g.group(2))
            i = g.end()
        for grupo in grupos:
            for k in grupo.split(","):
                if k.strip():
                    yield k.strip()


def citas_en_tex(proyecto):
    citas = {}
    raiz = Path(proyecto)
    archivos = list((raiz / "capitulos").glob("**/*.tex")) + list((raiz / "anexos").glob("**/*.tex")) +         list((raiz / "generado").glob("**/*.tex")) + [p for p in [raiz / "main.tex"] if p.exists()]
    for f in archivos:
        texto = re.sub(r"(?<!\\)%.*", "", f.read_text(encoding="utf-8"))
        for k in claves_de(texto):
            citas.setdefault(k, set()).add(f.relative_to(raiz).as_posix())
    return citas


def validar(clave, tipo, c, cache, problemas):
    def p(nivel, msg):
        problemas.append((nivel, clave, msg))
    if not c.get("date") and not c.get("year"):
        if tipo == "online":
            p("AVISO", "sin fecha: biblatex-apa imprimirá «s.f.»; confirma que la página realmente no la tiene")
        else:
            p("ERROR", "sin fecha: añade date = {AAAA} (biblatex-apa pone «s.f.» solo si falta, y eso es raro fuera de páginas web)")
    if not c.get("title"):
        p("ERROR", "sin título")
    if tipo == "article" and not c.get("journaltitle") and not c.get("journal"):
        p("ERROR", "artículo sin journaltitle")
    if not c.get("doi") and not c.get("url") and tipo not in ("book", "incollection"):
        p("AVISO", "sin DOI ni URL (APA 7 los pide cuando existen)")
    if c.get("doi") and c.get("url") and "doi.org" in c["url"]:
        p("AVISO", "url duplica el DOI; basta con doi")
    if c.get("doi"):
        ok = doi_existe(c["doi"], cache)
        if ok is False:
            p("ERROR", f"DOI {c['doi']} NO existe en doi.org (posible referencia inventada)")
        elif ok is None:
            p("AVISO", f"no se pudo verificar el DOI {c['doi']} (sin conexión)")
    autores = c.get("author", "")
    if re.search(r"\bet\.? al\b", autores):
        p("ERROR", "'et al.' dentro de author: pon todos los autores (hasta 20), biblatex-apa abrevia solo")
    for a in re.split(r"\s+and\s+", autores):
        a = a.strip()
        if a and "," not in a and not a.startswith("{") and len(a.split()) >= 3:
            p("AVISO", f"'{a}' parece autor corporativo: envuélvelo en llaves dobles {{{{...}}}}")
    if c.get("langid") == "spanish" and c.get("title"):
        palabras = [w for w in re.findall(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]+", c["title"]) if len(w) > 3]
        if len(palabras) >= 4 and sum(w[0].isupper() for w in palabras[1:]) / max(len(palabras) - 1, 1) > 0.5:
            p("AVISO", "título en español con Mayúsculas Iniciales: APA en español usa tipo oración")
    if not c.get("langid"):
        p("AVISO", "sin langid (english/spanish): biblatex-apa lo usa para mayúsculas y separadores")


def check(proyecto):
    path = ruta_bib(proyecto)
    entradas = leer_bib(path)
    cache_p = path.parent / ".doi-verificados.json"
    cache = json.loads(cache_p.read_text(encoding="utf-8")) if cache_p.exists() else {}
    citas = citas_en_tex(proyecto)
    problemas = []
    for k, archivos in sorted(citas.items()):
        if k not in entradas:
            problemas.append(("ERROR", k, f"citada en {', '.join(sorted(archivos))} pero no está en el .bib"))
    for k in sorted(entradas):
        if k not in citas:
            problemas.append(("AVISO", k, "está en el .bib pero no se cita (APA: solo lo citado va en referencias)"))
    for k, (tipo, c) in entradas.items():
        validar(k, tipo, c, cache, problemas)
    cache_p.write_text(json.dumps(cache, indent=0), encoding="utf-8")
    errores = [x for x in problemas if x[0] == "ERROR"]
    for nivel, k, msg in sorted(problemas):
        print(f"{nivel:5} {k}: {msg}")
    print(f"\n{len(entradas)} entradas, {len(citas)} claves citadas, {len(errores)} errores, "
          f"{len(problemas) - len(errores)} avisos")
    sys.exit(1 if errores else 0)


# ------------------------------------------------------------ fichas

def leer_meta_ficha(texto):
    m = re.match(r"^---\s*\n(.*?)\n---", texto, flags=re.S)
    meta = {}
    if m:
        for l in m.group(1).splitlines():
            if ":" in l:
                k, v = l.split(":", 1)
                meta[k.strip()] = re.sub(r"\s+#.*$", "", v).strip()
    return meta


def desde_fichas(proyecto, cache):
    path = ruta_bib(proyecto)
    for f in sorted((Path(proyecto) / "literatura" / "fichas").glob("*.md")):
        texto = f.read_text(encoding="utf-8")
        meta = leer_meta_ficha(texto)
        if meta.get("bibkey") and meta["bibkey"] in leer_bib(path):
            continue
        try:
            if meta.get("doi"):
                tipo, campos, ape, titulo = desde_doi(meta["doi"], cache)
            elif meta.get("tipo", "").startswith("tesis"):
                grado = {"tesis-pregrado": "Tesis de pregrado", "tesis-maestria": "Tesis de maestría",
                         "tesis-doctorado": "Tesis doctoral"}.get(meta["tipo"], "Tesis")
                autores = " and ".join(a.strip() for a in meta.get("autores", "").split(";") if a.strip())
                titulo = meta.get("titulo", "")
                tipo, campos = "thesis", {"author": autores, "date": meta.get("anio", ""), "title": escapar(titulo),
                                          "type": grado, "institution": escapar(meta.get("revista", "")),
                                          "url": meta.get("url", ""), "langid": detectar_idioma(titulo, meta.get("idioma", ""))}
                ape = autores.split(",")[0]
            else:
                print(f"OMITIDA {f.name}: sin DOI y no es tesis; añádela con 'web' o 'isbn'")
                continue
        except SystemExit as e:
            print(f"OMITIDA {f.name}: {e}")
            continue
        clave = agregar(path, tipo, {k: v for k, v in campos.items() if v}, apellido=ape, titulo=titulo)
        if re.search(r"^bibkey:.*$", texto, flags=re.M):
            texto = re.sub(r"^bibkey:.*$", f"bibkey: {clave}", texto, count=1, flags=re.M)
        else:
            texto = re.sub(r"^---\s*\n", f"---\nbibkey: {clave}\n", texto, count=1)
        f.write_text(texto, encoding="utf-8")


# ------------------------------------------------------------ principal

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("accion", choices=["doi", "isbn", "tesis", "web", "desde-fichas", "check"])
    ap.add_argument("valores", nargs="*")
    ap.add_argument("--proyecto", default=".")
    ap.add_argument("--clave")
    ap.add_argument("--autor", default="")
    ap.add_argument("--anio", default="")
    ap.add_argument("--titulo", default="")
    ap.add_argument("--universidad", default="")
    ap.add_argument("--grado", choices=["pregrado", "maestria", "doctorado"], default="pregrado")
    ap.add_argument("--sitio", default="")
    ap.add_argument("--fecha", default="", help="AAAA-MM-DD de publicación de la página")
    ap.add_argument("--url", default="")
    a = ap.parse_args()

    if a.accion == "check":
        check(a.proyecto)
        return
    path = ruta_bib(a.proyecto)
    cache_p = path.parent / ".doi-verificados.json"
    cache = json.loads(cache_p.read_text(encoding="utf-8")) if cache_p.exists() else {}
    try:
        if a.accion == "desde-fichas":
            desde_fichas(a.proyecto, cache)
        elif a.accion == "doi":
            for d in a.valores:
                tipo, campos, ape, titulo = desde_doi(d, cache)
                agregar(path, tipo, campos, a.clave if len(a.valores) == 1 else None, ape, titulo)
        elif a.accion == "isbn":
            for i in a.valores:
                tipo, campos, ape, titulo = desde_isbn(i)
                agregar(path, tipo, campos, a.clave if len(a.valores) == 1 else None, ape, titulo)
        elif a.accion in ("tesis", "web"):
            if not (a.autor and a.titulo and a.url):
                raise SystemExit("--autor, --titulo y --url son obligatorios")
            campos = {"author": autor_cli(a.autor), "date": a.fecha or a.anio, "title": escapar(a.titulo), "url": a.url,
                      "langid": detectar_idioma(a.titulo)}
            if a.accion == "tesis":
                campos.update(type={"pregrado": "Tesis de pregrado", "maestria": "Tesis de maestría",
                                    "doctorado": "Tesis doctoral"}[a.grado], institution=escapar(a.universidad))
                tipo = "thesis"
            else:
                campos["organization"] = escapar(a.sitio)
                tipo = "online"
            ape = autor_cli(a.autor).strip("{}").split(",")[0]
            agregar(path, tipo, {k: v for k, v in campos.items() if v}, a.clave, ape, a.titulo)
    finally:
        cache_p.write_text(json.dumps(cache, indent=0), encoding="utf-8")


if __name__ == "__main__":
    main()
