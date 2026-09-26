"""Utilidades compartidas por los scripts de tesis-literatura.

Solo stdlib. El directorio del proyecto de tesis se pasa con --proyecto (por
defecto el directorio actual). Variables de entorno:

  TESIS_MAILTO       correo para el "polite pool" de OpenAlex, Crossref y Unpaywall
  S2_API_KEY         opcional, sube el límite de Semantic Scholar
  CORE_API_KEY       opcional, activa CORE
  SCOPUS_API_KEY     opcional, activa Scopus (requiere acceso institucional)
  IEEE_API_KEY       opcional, activa IEEE Xplore
"""

from __future__ import annotations

import csv
import datetime as _dt
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

MAILTO = os.environ.get("TESIS_MAILTO", "")
UA = f"Mozilla/5.0 (compatible; tesis-literatura/1.0; +https://github.com/Jibaru/skills{'; mailto:' + MAILTO if MAILTO else ''})"

CAMPOS_CANDIDATO = [
    "id", "fuente", "anio", "titulo", "autores", "venue", "tipo", "idioma", "pais",
    "doi", "url", "oa_url", "citas", "abstract",
    "filtro_titulo", "filtro_abstract", "filtro_texto", "motivo",
]

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# ---------------------------------------------------------------- HTTP

def http(url: str, params: dict | None = None, headers: dict | None = None,
         reintentos: int = 4, timeout: int = 40, binario: bool = False,
         metodo: str = "GET"):
    """GET con reintentos y backoff ante 429/5xx. Devuelve bytes o str."""
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params, doseq=True)
    h = {"User-Agent": UA, "Accept": "*/*"}
    if headers:
        h.update(headers)
    espera = 2.0
    for intento in range(reintentos):
        req = urllib.request.Request(url, headers=h, method=metodo)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
                return data if binario else data.decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            # arXiv responde 406 cuando limita la tasa
            if e.code in (406, 429, 500, 502, 503, 504) and intento < reintentos - 1:
                ra = e.headers.get("Retry-After")
                time.sleep(float(ra) if ra and ra.isdigit() else espera)
                espera *= 2
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if intento < reintentos - 1:
                time.sleep(espera)
                espera *= 2
                continue
            raise
    raise RuntimeError("inalcanzable")


def http_json(url: str, params: dict | None = None, headers: dict | None = None, **kw):
    txt = http(url, params, headers, **kw)
    i = min([p for p in (txt.find("{"), txt.find("[")) if p >= 0], default=0)
    return json.loads(txt[i:])  # algunos VuFind anteponen warnings PHP


# ---------------------------------------------------------------- texto

def sin_acentos(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def norm_titulo(t: str) -> str:
    return re.sub(r"[^a-z0-9]", "", sin_acentos((t or "").lower()))[:120]


def slug(t: str, n: int = 6) -> str:
    palabras = re.findall(r"[a-z0-9]+", sin_acentos((t or "").lower()))
    vacias = {"a", "an", "the", "of", "and", "for", "in", "on", "to", "with", "de", "la", "el",
              "los", "las", "en", "y", "del", "al", "para", "por", "un", "una", "using", "based", "mediante"}
    return "-".join([p for p in palabras if p not in vacias][:n]) or "sin-titulo"


def norm_doi(d: str) -> str:
    d = (d or "").strip()
    d = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*)", "", d, flags=re.I)
    return d.lower().rstrip(".")


def primer_apellido(autores: str) -> str:
    primero = (autores or "").split(";")[0].strip()
    if "," in primero:
        ape = primero.split(",")[0]
    else:
        ape = primero.split(" ")[-1] if primero else "anonimo"
    return slug(ape, 1) or "anonimo"


def nombre_pdf(anio, autores: str, titulo: str) -> str:
    return f"{anio or 'sf'}-{primer_apellido(autores)}-{slug(titulo, 5)}.pdf"


# ---------------------------------------------------------------- proyecto

def rutas(proyecto: str | Path) -> dict:
    p = Path(proyecto).resolve()
    lit = p / "literatura"
    r = {
        "proyecto": p, "lit": lit, "pdfs": lit / "pdfs", "fichas": lit / "fichas",
        "texto": lit / "texto", "candidatos": lit / "candidatos.csv",
        "indice": lit / "indice.csv", "busquedas": lit / "busquedas.md",
        "pendientes": lit / "PENDIENTES.md", "matriz": lit / "matriz-revision.csv",
        "yaml": p / "tesis.yaml",
    }
    for k in ("lit", "pdfs", "fichas", "texto"):
        r[k].mkdir(parents=True, exist_ok=True)
    return r


def ventana_anios(r: dict) -> int:
    """Lee meta.antecedentes_ventana_anios de tesis.yaml sin depender de PyYAML."""
    try:
        m = re.search(r"antecedentes_ventana_anios:\s*(\d+)", r["yaml"].read_text(encoding="utf-8"))
        if m:
            return int(m.group(1))
    except FileNotFoundError:
        pass
    return 5


def anio_actual() -> int:
    return _dt.date.today().year


def leer_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def escribir_csv(path: Path, filas: list[dict], campos: list[str]) -> None:
    extra = [k for f in filas for k in f if k not in campos]
    campos = campos + sorted(set(extra), key=extra.index)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos, extrasaction="ignore")
        w.writeheader()
        for fila in filas:
            w.writerow({k: fila.get(k, "") for k in campos})


def es_pdf(data: bytes) -> bool:
    return data[:1024].lstrip().startswith(b"%PDF")


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)
