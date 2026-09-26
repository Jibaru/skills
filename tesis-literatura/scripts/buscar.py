#!/usr/bin/env python3
"""Busca literatura en fuentes abiertas y acumula candidatos en literatura/candidatos.csv.

Uso:
  python buscar.py --proyecto RUTA --cadena '("chatbot" OR "conversational agent") AND (whatsapp)' \
      [--fuentes auto|openalex,s2,crossref,arxiv,alicia,lareferencia,core,scopus,ieee] [--desde 2021] [--hasta 2026] \
      [--max 50] [--idiomas en,es] [--tesis]

La cadena usa la sintaxis del curso: sinónimos con OR dentro de paréntesis y
conceptos unidos con AND. Frases entre comillas dobles. Cada fuente recibe la
traducción que entiende (booleana completa donde se puede, palabras clave donde no).

Fuentes:
  openalex      artículos, conferencias, libros (índice que cubre Scopus/IEEE/WoS vía DOI)
  s2            Semantic Scholar (bulk search, booleano). S2_API_KEY opcional
  crossref      metadatos de editoriales; búsqueda por relevancia, sin booleanos
  arxiv         preprints (siempre con PDF abierto)
  alicia        ALICIA de CONCYTEC: tesis y artículos peruanos (API VuFind)
  lareferencia  La Referencia: tesis y artículos latinoamericanos (API VuFind)
  core          requiere CORE_API_KEY
  scopus        requiere SCOPUS_API_KEY (acceso institucional)
  ieee          requiere IEEE_API_KEY

Con --fuentes auto (por defecto) se usan las cinco abiertas más core/scopus/ieee
cuando su key está en el entorno o en <proyecto>/.env. Al final se imprime qué
fuentes se usaron y cuáles se omitieron; lo mismo queda en busquedas.md.

Si --desde no se da, se usa año actual − meta.antecedentes_ventana_anios de tesis.yaml.
"""

from __future__ import annotations

import argparse
import os
import re
import time
import xml.etree.ElementTree as ET

from comun import (CAMPOS_CANDIDATO, anio_actual, escribir_csv, fuentes_con_clave, http, http_json,
                   leer_csv, log, norm_doi, norm_titulo, requisito_fuente, rutas, ventana_anios)

FUENTES_BASE = ["openalex", "s2", "crossref", "alicia", "lareferencia"]

# ------------------------------------------------------------ cadena booleana

def parsear(cadena: str) -> list[list[str]]:
    """'(a OR "b c") AND (d)' -> [['a', 'b c'], ['d']]  (AND de grupos OR)."""
    grupos, prof, actual = [], 0, ""
    tokens = re.split(r"(\(|\)|\"[^\"]*\"|\s+AND\s+)", cadena, flags=re.I)
    for t in tokens:
        if t is None or t == "":
            continue
        if t == "(":
            prof += 1
        elif t == ")":
            prof -= 1
        if prof == 0 and re.fullmatch(r"\s+AND\s+", t, flags=re.I):
            grupos.append(actual)
            actual = ""
        else:
            actual += t
    grupos.append(actual)
    salida = []
    for g in grupos:
        g = g.strip().strip("()").strip()
        terminos = [x.strip().strip('"').strip() for x in re.split(r"\s+OR\s+", g, flags=re.I)]
        terminos = [x for x in terminos if x]
        if terminos:
            salida.append(terminos)
    return salida


def q(t: str) -> str:
    return f'"{t}"' if " " in t else t


def a_booleana(grupos, y="AND", o="OR", pref="", entre=("(", ")")) -> str:
    partes = []
    for g in grupos:
        ors = f" {o} ".join(pref + q(t) for t in g)
        partes.append(entre[0] + ors + entre[1] if len(g) > 1 else ors)
    return f" {y} ".join(partes)


def cumple(grupos, texto: str) -> bool:
    """AND de grupos, OR dentro: al menos un término de cada grupo aparece en el texto."""
    t = texto.lower()
    return all(any(term.lower() in t for term in g) for g in grupos)


def a_palabras(grupos) -> str:
    """Para fuentes sin booleanos: primer término de cada grupo."""
    return " ".join(g[0] for g in grupos)


# ------------------------------------------------------------ fuentes

def fila(**kw) -> dict:
    f = {k: "" for k in CAMPOS_CANDIDATO}
    f.update({k: ("" if v is None else v) for k, v in kw.items()})
    f["doi"] = norm_doi(f["doi"])
    return f


def openalex(grupos, desde, hasta, maximo, idiomas, tesis):
    filtros = [f"title_and_abstract.search:{a_booleana(grupos).replace(',', ' ')}",
               f"from_publication_date:{desde}-01-01", f"to_publication_date:{hasta}-12-31"]
    if idiomas:
        filtros.append("language:" + "|".join(idiomas))
    filtros.append("type:" + ("dissertation" if tesis else "article|review|book-chapter|preprint"))
    params = {"filter": ",".join(filtros), "per-page": min(maximo, 200), "sort": "relevance_score:desc"}
    from comun import MAILTO
    if MAILTO:
        params["mailto"] = MAILTO
    d = http_json("https://api.openalex.org/works", params)
    log(f"  openalex: {d['meta']['count']} coincidencias totales")
    out = []
    for w in d.get("results", []):
        inv = w.get("abstract_inverted_index") or {}
        pos = sorted((p, pal) for pal, ps in inv.items() for p in ps)
        loc = (w.get("primary_location") or {}).get("source") or {}
        oa = w.get("best_oa_location") or {}
        paises = {i.get("country_code") for a in w.get("authorships", []) for i in a.get("institutions", []) if i.get("country_code")}
        out.append(fila(
            fuente="OpenAlex", anio=w.get("publication_year"), titulo=w.get("title"),
            autores="; ".join(a["author"]["display_name"] for a in w.get("authorships", [])[:20]),
            venue=loc.get("display_name"), tipo=w.get("type"), idioma=w.get("language"),
            pais=",".join(sorted(paises)), doi=w.get("doi"), url=w.get("id"),
            oa_url=oa.get("pdf_url") or "", citas=w.get("cited_by_count"),
            abstract=" ".join(p for _, p in pos)))
    return out


def s2(grupos, desde, hasta, maximo, idiomas, tesis):
    consulta = " + ".join("(" + " | ".join(q(t) for t in g) + ")" for g in grupos)
    headers = {"x-api-key": os.environ["S2_API_KEY"]} if os.environ.get("S2_API_KEY") else None
    params = {"query": consulta, "year": f"{desde}-{hasta}",
              "fields": "title,year,externalIds,abstract,venue,citationCount,openAccessPdf,authors,publicationTypes,url"}
    d = http_json("https://api.semanticscholar.org/graph/v1/paper/search/bulk", params, headers, reintentos=6)
    log(f"  s2: {d.get('total', '?')} coincidencias totales")
    out = []
    for p in (d.get("data") or [])[:maximo]:
        ext = p.get("externalIds") or {}
        oa = p.get("openAccessPdf") or {}
        doi = ext.get("DOI") or ""
        oa_url = oa.get("url") or (f"https://arxiv.org/pdf/{ext['ArXiv']}" if ext.get("ArXiv") else "")
        out.append(fila(
            fuente="Semantic Scholar", anio=p.get("year"), titulo=p.get("title"),
            autores="; ".join(a.get("name", "") for a in (p.get("authors") or [])[:20]),
            venue=p.get("venue"), tipo=",".join(p.get("publicationTypes") or []), doi=doi,
            url=p.get("url"), oa_url=oa_url, citas=p.get("citationCount"),
            abstract=p.get("abstract") or ""))
    return out


def crossref(grupos, desde, hasta, maximo, idiomas, tesis):
    from comun import MAILTO
    filtros = [f"from-pub-date:{desde}", f"until-pub-date:{hasta}"]
    filtros.append("type:dissertation" if tesis else "type:journal-article")
    params = {"query.bibliographic": " ".join(t for g in grupos for t in g[:2]),
              "filter": ",".join(filtros), "rows": min(maximo, 100)}
    if MAILTO:
        params["mailto"] = MAILTO
    d = http_json("https://api.crossref.org/works", params)["message"]
    log(f"  crossref: {d.get('total-results')} coincidencias totales (relevancia, sin booleanos)")
    out = []
    for it in d.get("items", []):
        anio = ((it.get("issued") or {}).get("date-parts") or [[None]])[0][0]
        abstract = re.sub(r"<[^>]+>", " ", it.get("abstract", "") or "")
        out.append(fila(
            fuente="Crossref", anio=anio, titulo=(it.get("title") or [""])[0],
            autores="; ".join(f"{a.get('family', '')}, {a.get('given', '')}".strip(", ") for a in it.get("author", [])[:20]),
            venue=(it.get("container-title") or [""])[0], tipo=it.get("type"),
            idioma=it.get("language", ""), doi=it.get("DOI"), url=it.get("URL"),
            citas=it.get("is-referenced-by-count"), abstract=re.sub(r"\s+", " ", abstract).strip()))
    # Crossref no entiende booleanos: se aplica la cadena localmente sobre título + abstract
    antes = len(out)
    out = [f for f in out if cumple(grupos, f["titulo"] + " " + f["abstract"])]
    log(f"  crossref: {len(out)}/{antes} cumplen la cadena booleana")
    return out


def arxiv(grupos, desde, hasta, maximo, idiomas, tesis):
    if tesis:
        return []
    time.sleep(3)  # arXiv pide 3 s entre peticiones
    consulta = a_booleana(grupos, pref="all:")
    consulta += f" AND submittedDate:[{desde}01010000 TO {hasta}12312359]"
    xml = http("https://export.arxiv.org/api/query", {"search_query": consulta, "max_results": maximo})
    ns = {"a": "http://www.w3.org/2005/Atom", "x": "http://arxiv.org/schemas/atom"}
    raiz = ET.fromstring(xml)
    out = []
    for e in raiz.findall("a:entry", ns):
        aid = e.findtext("a:id", "", ns).rsplit("/abs/", 1)[-1]
        doi = e.findtext("x:doi", "", ns)
        out.append(fila(
            fuente="arXiv", anio=e.findtext("a:published", "", ns)[:4],
            titulo=re.sub(r"\s+", " ", e.findtext("a:title", "", ns)).strip(),
            autores="; ".join(a.findtext("a:name", "", ns) for a in e.findall("a:author", ns)[:20]),
            venue="arXiv", tipo="preprint", idioma="en", doi=doi or f"10.48550/arxiv.{aid.split('v')[0]}",
            url=f"https://arxiv.org/abs/{aid}", oa_url=f"https://arxiv.org/pdf/{aid}",
            abstract=re.sub(r"\s+", " ", e.findtext("a:summary", "", ns)).strip()))
    log(f"  arxiv: {len(out)} recuperados")
    return out


def vufind(base, nombre, grupos, desde, hasta, maximo, idiomas, tesis):
    campos = ["id", "title", "authors", "publicationDates", "urls", "formats", "institutions",
              "summary", "languages"]
    params = [("lookfor", a_booleana(grupos)), ("type", "AllFields"), ("limit", min(maximo, 100)),
              ("filter[]", f'publishDate:"[{desde} TO {hasta}]"')]
    if tesis:
        # el prefijo ~ hace OR entre valores de la misma faceta en VuFind
        params += [("filter[]", f'~format:"{t}"') for t in ("bachelorThesis", "masterThesis", "doctoralThesis")]
    params += [("field[]", c) for c in campos]
    import urllib.error
    import urllib.parse
    try:
        d = http_json(base + "?" + urllib.parse.urlencode(params))
    except urllib.error.HTTPError as e:
        if e.code != 400:
            raise
        time.sleep(5)  # ALICIA devuelve 400 esporádicos; un reintento basta
        d = http_json(base + "?" + urllib.parse.urlencode(params))
    log(f"  {nombre}: {d.get('resultCount')} coincidencias totales")
    out = []
    for r in d.get("records", []):
        prim = (r.get("authors") or {}).get("primary") or {}
        autores = "; ".join(list(prim.keys()) + list(((r.get("authors") or {}).get("secondary") or {}) or []))
        urls = [u.get("url", "") for u in r.get("urls") or []]
        doi = next((norm_doi(u) for u in urls if "doi.org/" in u), "")
        pdf = next((u for u in urls if u.lower().endswith(".pdf") or "bitstream" in u), "")
        resumen = r.get("summary") or []
        out.append(fila(
            fuente=nombre, anio=(r.get("publicationDates") or [""])[0], titulo=r.get("title"),
            autores=autores, venue="; ".join(r.get("institutions") or []),
            tipo=",".join(r.get("formats") or []), idioma=",".join(r.get("languages") or []),
            pais=r.get("country", ""), doi=doi, url=(urls[0] if urls else ""), oa_url=pdf,
            abstract=(resumen[0] if isinstance(resumen, list) and resumen else str(resumen))))
    return out


def alicia(*a):
    return vufind("https://alicia.concytec.gob.pe/vufind/api/v1/search", "ALICIA", *a)


def lareferencia(*a):
    return vufind("https://www.lareferencia.info/vufind/api/v1/search", "La Referencia", *a)


def core(grupos, desde, hasta, maximo, idiomas, tesis):
    clave = os.environ.get("CORE_API_KEY")
    if not clave:
        log("  core: omitido (sin CORE_API_KEY)")
        return []
    consulta = f"({a_booleana(grupos)}) AND yearPublished>={desde} AND yearPublished<={hasta}"
    d = http_json("https://api.core.ac.uk/v3/search/works", {"q": consulta, "limit": min(maximo, 100)},
                  {"Authorization": f"Bearer {clave}"})
    log(f"  core: {d.get('totalHits')} coincidencias totales")
    return [fila(fuente="CORE", anio=w.get("yearPublished"), titulo=w.get("title"),
                 autores="; ".join(a.get("name", "") for a in (w.get("authors") or [])[:20]),
                 venue=(w.get("journals") or [{}])[0].get("title", "") if w.get("journals") else "",
                 doi=w.get("doi"), url=(w.get("links") or [{}])[0].get("url", "") if w.get("links") else "",
                 oa_url=w.get("downloadUrl") or "", abstract=w.get("abstract") or "")
            for w in d.get("results", [])]


def scopus(grupos, desde, hasta, maximo, idiomas, tesis):
    clave = os.environ.get("SCOPUS_API_KEY")
    if not clave:
        log("  scopus: omitido (sin SCOPUS_API_KEY)")
        return []
    consulta = f"TITLE-ABS-KEY({a_booleana(grupos)}) AND PUBYEAR > {desde - 1} AND PUBYEAR < {hasta + 1}"
    d = http_json("https://api.elsevier.com/content/search/scopus",
                  {"query": consulta, "count": min(maximo, 25)}, {"X-ELS-APIKey": clave, "Accept": "application/json",
                   **({"X-ELS-Insttoken": os.environ["SCOPUS_INSTTOKEN"]} if os.environ.get("SCOPUS_INSTTOKEN") else {})})
    res = d.get("search-results", {})
    log(f"  scopus: {res.get('opensearch:totalResults')} coincidencias totales")
    return [fila(fuente="Scopus", anio=(e.get("prism:coverDate") or "")[:4], titulo=e.get("dc:title"),
                 autores=e.get("dc:creator", ""), venue=e.get("prism:publicationName"),
                 tipo=e.get("subtypeDescription"), doi=e.get("prism:doi"), citas=e.get("citedby-count"),
                 url=next((l["@href"] for l in e.get("link", []) if l.get("@ref") == "scopus"), ""))
            for e in res.get("entry", []) if "error" not in e]


def ieee(grupos, desde, hasta, maximo, idiomas, tesis):
    clave = os.environ.get("IEEE_API_KEY")
    if not clave:
        log("  ieee: omitido (sin IEEE_API_KEY)")
        return []
    d = http_json("https://ieeexploreapi.ieee.org/api/v1/search/articles",
                  {"querytext": a_booleana(grupos), "start_year": desde, "end_year": hasta,
                   "max_records": min(maximo, 200), "apikey": clave})
    log(f"  ieee: {d.get('total_records')} coincidencias totales")
    return [fila(fuente="IEEE Xplore", anio=a.get("publication_year"), titulo=a.get("title"),
                 autores="; ".join(x.get("full_name", "") for x in (a.get("authors") or {}).get("authors", [])),
                 venue=a.get("publication_title"), tipo=a.get("content_type"), doi=a.get("doi"),
                 url=a.get("html_url"), citas=a.get("citing_paper_count"), abstract=a.get("abstract", ""))
            for a in d.get("articles", [])]


FUENTES = {"openalex": openalex, "s2": s2, "crossref": crossref, "arxiv": arxiv, "alicia": alicia,
           "lareferencia": lareferencia, "core": core, "scopus": scopus, "ieee": ieee}


# ------------------------------------------------------------ principal

def fusionar(existentes: list[dict], nuevos: list[dict]) -> tuple[list[dict], int]:
    por_doi = {f["doi"]: f for f in existentes if f.get("doi")}
    por_tit = {norm_titulo(f["titulo"]): f for f in existentes}
    agregados = 0
    for n in nuevos:
        if not n.get("titulo"):
            continue
        previo = por_doi.get(n["doi"]) if n["doi"] else None
        previo = previo or por_tit.get(norm_titulo(n["titulo"]))
        if previo:
            fuentes = previo["fuente"].split("; ")  # la primera es la fuente principal
            if n["fuente"] not in fuentes:
                previo["fuente"] = "; ".join(fuentes + [n["fuente"]])
            for k, v in n.items():  # completa campos vacíos
                if not previo.get(k) and v:
                    previo[k] = v
            continue
        n["id"] = f"C{len(existentes) + 1:04d}"
        existentes.append(n)
        if n["doi"]:
            por_doi[n["doi"]] = n
        por_tit[norm_titulo(n["titulo"])] = n
        agregados += 1
    return existentes, agregados


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--proyecto", default=".")
    ap.add_argument("--cadena", required=True)
    ap.add_argument("--fuentes", default="auto",
                    help="auto = openalex,s2,crossref,alicia,lareferencia + core/scopus/ieee si hay key; "
                         "o una lista separada por comas (arxiv es opcional)")
    ap.add_argument("--desde", type=int)
    ap.add_argument("--hasta", type=int)
    ap.add_argument("--max", type=int, default=50, help="máximo por fuente")
    ap.add_argument("--idiomas", default="en,es")
    ap.add_argument("--tesis", action="store_true", help="buscar tesis en vez de artículos")
    ap.add_argument("--etiqueta", default="", help="nombre de la búsqueda en busquedas.md")
    a = ap.parse_args()

    r = rutas(a.proyecto)
    hasta = a.hasta or anio_actual()
    desde = a.desde or (anio_actual() - ventana_anios(r))
    grupos = parsear(a.cadena)
    if not grupos:
        raise SystemExit("cadena vacía")
    idiomas = [x for x in a.idiomas.split(",") if x]
    log(f"Buscando {grupos} ({desde}-{hasta})")

    if a.fuentes == "auto":
        pedidas = FUENTES_BASE + fuentes_con_clave()
    else:
        pedidas = [f.strip() for f in a.fuentes.split(",") if f.strip()]
    omitidas = []  # (fuente, motivo)
    for opcional in ("core", "scopus", "ieee"):
        falta = requisito_fuente(opcional)
        if falta and (a.fuentes == "auto" or opcional in pedidas):
            omitidas.append((opcional, f"sin {falta}"))
    pedidas = [f for f in pedidas if not requisito_fuente(f)]

    existentes = leer_csv(r["candidatos"])
    conteo = []
    for nombre in pedidas:
        fn = FUENTES.get(nombre)
        if not fn:
            log(f"  fuente desconocida: {nombre}")
            omitidas.append((nombre, "desconocida"))
            continue
        try:
            nuevos = fn(grupos, desde, hasta, a.max, idiomas, a.tesis)
        except Exception as e:  # una fuente caída no detiene las demás
            pista = " (key rechazada: revisa con `python claves.py --probar`)" if any(
                c in str(e) for c in ("401", "403")) else ""
            log(f"  {nombre}: ERROR {e}{pista}")
            conteo.append((nombre, "error", 0))
            continue
        existentes, agregados = fusionar(existentes, nuevos)
        conteo.append((nombre, len(nuevos), agregados))

    escribir_csv(r["candidatos"], existentes, CAMPOS_CANDIDATO)

    nueva = not r["busquedas"].exists()
    with r["busquedas"].open("a", encoding="utf-8") as f:
        if nueva:
            f.write("# Registro de búsquedas\n\n")
        f.write(f"## {a.etiqueta or 'Búsqueda'} ({__import__('datetime').date.today()})\n\n")
        f.write(f"- Cadena: `{a.cadena}`\n- Años: {desde}–{hasta}; idiomas: {', '.join(idiomas)}; "
                f"tipo: {'tesis' if a.tesis else 'artículos'}\n\n")
        f.write("| Fuente | Recuperados | Nuevos (tras deduplicar) |\n|---|---|---|\n")
        for n, rec, ag in conteo:
            f.write(f"| {n} | {rec} | {ag} |\n")
        if omitidas:
            f.write("\nFuentes omitidas: " + "; ".join(f"{n} ({m})" for n, m in omitidas) + "\n")
        f.write("\n")

    total_nuevos = sum(c[2] for c in conteo)
    usadas = [n for n, rec, _ in conteo if rec != "error"]
    fallidas = [n for n, rec, _ in conteo if rec == "error"]
    print(f"{total_nuevos} candidatos nuevos; {len(existentes)} en {r['candidatos']}")
    print(f"Fuentes usadas: {', '.join(usadas) or 'ninguna'}")
    if fallidas:
        print(f"Fuentes con error: {', '.join(fallidas)}")
    if omitidas:
        print("Fuentes omitidas: " + "; ".join(f"{n} ({m})" for n, m in omitidas)
              + " — ver `python claves.py` para conseguirlas")


if __name__ == "__main__":
    main()
