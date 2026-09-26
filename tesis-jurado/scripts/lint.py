#!/usr/bin/env python3
"""Revisión mecánica de la tesis: errores que el jurado marca y que se detectan sin leer.

Revisa capitulos/*.tex, tesis.yaml y bib/referencias.bib y reporta con archivo:línea:
  - título de más de 15 palabras (sin artículos, preposiciones ni conectores)
  - "et. al.", "&" en citas de texto en español, "Recuperado de", "Fuente:", "Tabla N°"
  - primera persona (nosotros, nuestro, realizamos, mi, yo…)
  - tiempos verbales: pasado en modo plan / futuro en resultados de modo tesis
  - antecedentes (2.1) fuera de la ventana de años (meta.antecedentes_ventana_anios)
  - tablas y figuras sin \\nota{} o sin mención (\\ref) en el texto
  - claves citadas que no están en el .bib, y entradas del .bib que nadie cita
  - problema/objetivo/hipótesis específicos de distinta cantidad en tesis.yaml

Uso: python lint.py --proyecto RUTA [--anio 2026]
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

VACIAS = set("""a al ante bajo con contra de del desde durante e el en entre hacia hasta la las lo los
mediante o para por segun sin sobre tras u un una unos unas y que su sus se como""".split())

REGLAS = [
    (r"\bet\.\s*al\b", "MENOR", "«et. al.» → «et al.» (sin punto después de et)"),
    (r"\([^()]*[A-ZÁÉÍÓÚ][a-záéíóú]+\s*\\?&\s*[A-ZÁÉÍÓÚ][^()]*\d{4}[^()]*\)",
     "MENOR", "«&» en cita en español → «y»"),
    (r"\bRecuperado de\b", "MENOR", "APA 7 no usa «Recuperado de»: va la URL directa"),
    (r"^\s*Fuente\s*:", "MENOR", "Usa «\\nota{…}» (Nota.) en vez de «Fuente:»"),
    (r"\b(Tabla|Figura)\s+N\s*[°º]", "MENOR", "«Tabla N°» no es APA: «Tabla 1»"),
    (r"\b(nosotros|nuestr[oa]s?|realizamos|hicimos|decidimos|proponemos|consideramos|"
     r"obtuvimos|implementamos|desarrollamos|intentamos|utilizamos|usamos)\b",
     "IMPORTANTE", "Primera persona: redacta en tercera persona impersonal («se realizó»)"),
    (r"(?<![\w\\])(yo|me|mi|mis)\b(?!\s*=)", "IMPORTANTE", "Primera persona del singular"),
    (r"\b(en la actualidad|hoy en día)\b", "MENOR", "Muletilla genérica: precisa el año o el dato"),
]

PASADO = re.compile(r"\bse (realizó|aplicó|obtuvo|implementó|midió|desarrolló|utilizó|encontró)\b|"
                    r"\b(fue|fueron) (aplicad|realizad|obtenid|medid|implementad)", re.I)
FUTURO = re.compile(r"\bse (realizará|aplicará|obtendrá|implementará|medirá|desarrollará|utilizará)\b", re.I)


def sin_comentarios(linea: str) -> str:
    return re.sub(r"(?<!\\)%.*", "", linea)


def claves_bib(bib: Path) -> dict[str, int | None]:
    if not bib.exists():
        return {}
    txt = bib.read_text(encoding="utf-8", errors="replace")
    out = {}
    for m in re.finditer(r"@\w+\s*\{\s*([^,\s]+)\s*,(.*?)(?=\n@|\Z)", txt, flags=re.S):
        anio = re.search(r"\b(?:year|date)\s*=\s*[{\"]?\s*(\d{4})", m.group(2), flags=re.I)
        out[m.group(1)] = int(anio.group(1)) if anio else None
    return out


def main(argv=None):
    for st in (sys.stdout, sys.stderr):
        try:
            st.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--proyecto", default=".")
    ap.add_argument("--anio", type=int, default=dt.date.today().year)
    a = ap.parse_args(argv)
    raiz = Path(a.proyecto).resolve()

    obs: list[tuple[str, str, str]] = []  # (nivel, lugar, mensaje)
    cfg = {}
    if yaml and (raiz / "tesis.yaml").exists():
        cfg = yaml.safe_load((raiz / "tesis.yaml").read_text(encoding="utf-8")) or {}
    meta = cfg.get("meta") or {}
    modo = meta.get("modo", "plan")
    ventana = int(meta.get("antecedentes_ventana_anios", 5))

    # Título
    titulo = meta.get("titulo") or ""
    if titulo:
        import unicodedata
        norm = "".join(c for c in unicodedata.normalize("NFKD", titulo.lower()) if not unicodedata.combining(c))
        palabras = [w for w in re.findall(r"[a-z0-9]+", norm) if w not in VACIAS]
        if len(palabras) > 15:
            obs.append(("IMPORTANTE", "tesis.yaml:meta.titulo",
                        f"El título tiene {len(palabras)} palabras contables (máx. 15, sin contar artículos, "
                        f"preposiciones, conectores ni el nombre de la organización: descuéntalo tú)"))

    # Alineación problema/objetivo/hipótesis
    n = {k: len((cfg.get(k) or {}).get("especificos") or []) for k in ("problema", "objetivos", "hipotesis")}
    if not meta.get("con_hipotesis", True):
        n.pop("hipotesis")
    if cfg and len(set(n.values())) > 1:
        obs.append(("CRÍTICA", "tesis.yaml", f"Cantidad de específicos desalineada: {n}"))

    tex = sorted((raiz / "capitulos").glob("*.tex"))
    todo_texto = ""
    citadas: dict[str, str] = {}
    etiquetas: dict[str, str] = {}
    for f in tex:
        rel = f"capitulos/{f.name}"
        lineas = f.read_text(encoding="utf-8", errors="replace").split("\n")
        texto = "\n".join(sin_comentarios(l) for l in lineas)
        todo_texto += texto + "\n"
        for i, l in enumerate(lineas, 1):
            l = sin_comentarios(l)
            if not l.strip():
                continue
            for patron, nivel, msg in REGLAS:
                if re.search(patron, l, flags=0 if "&" in msg else re.I):
                    obs.append((nivel, f"{rel}:{i}", msg))
            es_resultados = any(k in f.name for k in ("resultados", "discusion", "conclusiones"))
            if modo == "plan" and PASADO.search(l) and not es_resultados:
                obs.append(("IMPORTANTE", f"{rel}:{i}", "Pasado en un plan: lo que aún no se hizo va en futuro"))
            if modo == "tesis" and FUTURO.search(l):
                obs.append(("IMPORTANTE", f"{rel}:{i}", "Futuro en la tesis: lo ejecutado va en pasado"))
            for m in re.finditer(r"\\[a-zA-Z]*cite[a-zA-Z]*\*?(?:\[[^\]]*\])*\{([^}]*)\}", l):
                for k in m.group(1).split(","):
                    citadas.setdefault(k.strip(), f"{rel}:{i}")
            for m in re.finditer(r"\\label\{((?:tab|fig):[^}]+)\}", l):
                etiquetas[m.group(1)] = f"{rel}:{i}"

        # Tablas y figuras sin nota
        for m in re.finditer(r"\\begin\{(table|figure)\*?\}(.*?)\\end\{\1\*?\}", texto, flags=re.S):
            if "\\nota" not in m.group(2):
                linea = texto[:m.start()].count("\n") + 1
                obs.append(("MENOR", f"{rel}:{linea}", f"{'Tabla' if m.group(1) == 'table' else 'Figura'} sin \\nota{{…}}"))

    for et, lugar in etiquetas.items():
        if not re.search(r"\\(?:auto|c|C)?ref\{" + re.escape(et) + r"\}", todo_texto):
            obs.append(("MENOR", lugar, f"{et} no se menciona en el texto (falta \\ref)"))

    bib = claves_bib(raiz / "bib" / "referencias.bib")
    if bib:
        for k, lugar in citadas.items():
            if k not in bib:
                obs.append(("CRÍTICA", lugar, f"Cita «{k}» sin entrada en bib/referencias.bib"))
        for k in bib:
            if k not in citadas:
                obs.append(("MENOR", "bib/referencias.bib", f"Referencia «{k}» no citada en el texto (APA: solo lo citado)"))

    # Antecedentes fuera de ventana: citas dentro de la sección de antecedentes de 02-marco
    marco = raiz / "capitulos" / "02-marco.tex"
    if marco.exists() and bib:
        t = marco.read_text(encoding="utf-8", errors="replace")
        m = re.search(r"\\section\*?\{[^}]*[Aa]ntecedentes[^}]*\}(.*?)(?=\\section\*?\{|\Z)", t, flags=re.S)
        bloque = m.group(1) if m else ""
        minimo = a.anio - ventana
        for c in re.finditer(r"\\[a-zA-Z]*cite[a-zA-Z]*\*?(?:\[[^\]]*\])*\{([^}]*)\}", bloque):
            for k in (x.strip() for x in c.group(1).split(",")):
                anio = bib.get(k)
                if anio and anio < minimo:
                    obs.append(("IMPORTANTE", "capitulos/02-marco.tex",
                                f"Antecedente «{k}» ({anio}) fuera de la ventana {minimo}–{a.anio}"))
                elif anio == minimo:
                    obs.append(("MENOR", "capitulos/02-marco.tex",
                                f"Antecedente «{k}» ({anio}) en el límite de la ventana: un jurado estricto puede observarlo"))

    orden = {"CRÍTICA": 0, "IMPORTANTE": 1, "MENOR": 2}

    # Agrupa el mismo mensaje en el mismo archivo: «archivo:12, 40, 57»
    grupos: dict[tuple[str, str, str], list[int]] = {}
    for nivel, lugar, msg in obs:
        arch, _, lin = lugar.partition(":")
        grupos.setdefault((nivel, arch, msg), []).append(int(lin) if lin.isdigit() else 0)
    filas = sorted(grupos.items(), key=lambda g: (orden[g[0][0]], g[0][1], min(g[1])))
    print(f"# Revisión mecánica ({len(obs)} observaciones en {len(filas)} grupos)\n")
    for (nivel, arch, msg), lins in filas:
        lins = sorted(set(l for l in lins if l))
        donde = f"{arch}:{', '.join(map(str, lins[:12]))}{' …' if len(lins) > 12 else ''}" if lins else arch
        veces = f" (×{len(lins)})" if len(lins) > 1 else ""
        print(f"- **{nivel}** `{donde}` — {msg}{veces}")
    if not obs:
        print("Sin observaciones mecánicas. Falta la revisión de fondo (coherencia, metodología).")
    sys.exit(1 if any(o[0] == "CRÍTICA" for o in obs) else 0)


if __name__ == "__main__":
    main()
