#!/usr/bin/env python3
"""Renderiza las fuentes de figuras de la tesis a figuras/out/.

  .mmd   Mermaid   → PDF + PNG  (npx @mermaid-js/mermaid-cli; si no, docker minlag/mermaid-cli)
  .puml  PlantUML  → PNG + SVG  (docker plantuml/plantuml; o java -jar $PLANTUML_JAR)
  .py    matplotlib → lo que el script guarde (recibe FIG_OUT y FIG_ANCHO_CM en el entorno)

Uso:
  python figura.py --proyecto RUTA todo              # regenera solo lo modificado
  python figura.py --proyecto RUTA todo --forzar     # regenera todo
  python figura.py --proyecto RUTA figuras/src/arquitectura.mmd [...]
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ANCHO_CM = 15.5  # mancha tipográfica A4 con márgenes 3 / 2,5 cm
MERMAID_CLI = "@mermaid-js/mermaid-cli@12"  # v12: el PDF ya se ajusta al diagrama (sin --pdfFit)

MERMAID_CONFIG = {
    "theme": "neutral",
    "themeVariables": {
        "fontFamily": "Arial, Helvetica, sans-serif",
        "fontSize": "16px",
        "background": "#ffffff",
    },
    "flowchart": {"htmlLabels": True, "curve": "basis"},
    "sequence": {"mirrorActors": False},
}


def run(cmd: list[str], cwd: Path | None = None, env: dict | None = None) -> None:
    print("  $", " ".join(cmd))
    r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError((r.stdout + "\n" + r.stderr).strip()[-2000:])


def tiene(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def mermaid(src: Path, out: Path) -> list[Path]:
    salidas = [out / f"{src.stem}.pdf", out / f"{src.stem}.png"]
    with tempfile.TemporaryDirectory() as tmp:
        cfg = Path(tmp) / "mermaid.json"
        cfg.write_text(json.dumps(MERMAID_CONFIG), encoding="utf-8")
        if tiene("npx"):
            npx = shutil.which("npx")
            base = [npx, "-y", MERMAID_CLI, "-q", "-i", str(src), "-c", str(cfg), "-b", "white"]
            run(base + ["-o", str(salidas[0])])
            run(base + ["-o", str(salidas[1]), "-s", "3"])
        elif tiene("docker"):
            # la imagen monta un solo directorio: copiamos fuente y config al tmp
            shutil.copy(src, Path(tmp) / src.name)
            base = ["docker", "run", "--rm", "-v", f"{tmp}:/data", "minlag/mermaid-cli:latest",
                    "-q", "-i", f"/data/{src.name}", "-c", "/data/mermaid.json", "-b", "white"]
            run(base + ["-o", f"/data/{src.stem}.pdf"])
            run(base + ["-o", f"/data/{src.stem}.png", "-s", "3"])
            for s in salidas:
                shutil.copy(Path(tmp) / s.name, s)
        else:
            raise RuntimeError("Mermaid necesita Node (npx) o Docker.")
    return salidas


def plantuml(src: Path, out: Path) -> list[Path]:
    salidas = [out / f"{src.stem}.png", out / f"{src.stem}.svg"]
    jar = os.environ.get("PLANTUML_JAR")
    with tempfile.TemporaryDirectory() as tmp:
        shutil.copy(src, Path(tmp) / src.name)
        for fmt in ("png", "svg"):
            if jar and tiene("java"):
                run(["java", "-jar", jar, f"-t{fmt}", "-charset", "UTF-8", str(Path(tmp) / src.name)])
            elif tiene("docker"):
                run(["docker", "run", "--rm", "-v", f"{tmp}:/data", "plantuml/plantuml",
                     f"-t{fmt}", "-charset", "UTF-8", f"/data/{src.name}"])
            else:
                raise RuntimeError("PlantUML necesita Docker o PLANTUML_JAR con Java.")
        for s in salidas:
            generado = Path(tmp) / s.name
            if not generado.exists():
                raise RuntimeError(f"PlantUML no generó {s.name}. ¿El archivo tiene @startuml y @enduml?")
            shutil.copy(generado, s)
    return salidas


def matplotlib_py(src: Path, out: Path) -> list[Path]:
    env = dict(os.environ, FIG_OUT=str(out), FIG_ANCHO_CM=str(ANCHO_CM), MPLBACKEND="Agg",
               PYTHONIOENCODING="utf-8")
    antes = {p: p.stat().st_mtime for p in out.glob("*")}
    run([sys.executable, str(src)], cwd=src.parent, env=env)
    return [p for p in out.glob("*") if antes.get(p) != p.stat().st_mtime]


RENDER = {".mmd": mermaid, ".puml": plantuml, ".py": matplotlib_py}


def desactualizado(src: Path, out: Path) -> bool:
    """True si no hay salida con el mismo nombre o es más vieja que la fuente."""
    if src.suffix == ".py":
        return True  # un script puede generar varias salidas con otros nombres
    salidas = list(out.glob(f"{src.stem}.*"))
    return not salidas or min(p.stat().st_mtime for p in salidas) < src.stat().st_mtime


def main(argv=None):
    for st in (sys.stdout, sys.stderr):
        try:
            st.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--proyecto", default=".")
    ap.add_argument("--forzar", action="store_true", help="regenera aunque la salida esté al día")
    ap.add_argument("objetivos", nargs="+", help="'todo' o rutas a fuentes (.mmd, .puml, .py)")
    a = ap.parse_args(argv)

    raiz = Path(a.proyecto).resolve()
    src_dir, out = raiz / "figuras" / "src", raiz / "figuras" / "out"
    out.mkdir(parents=True, exist_ok=True)

    if a.objetivos == ["todo"]:
        fuentes = sorted(p for p in src_dir.rglob("*") if p.suffix in RENDER)
        if not a.forzar:
            fuentes = [p for p in fuentes if desactualizado(p, out)]
    else:
        fuentes = [Path(o) if Path(o).is_absolute() else (raiz / o) for o in a.objetivos]

    if not fuentes:
        print("Nada que regenerar.")
        return
    errores = 0
    for src in fuentes:
        if src.suffix not in RENDER:
            print(f"SALTO {src.name}: extensión no soportada")
            continue
        print(f"{src.relative_to(raiz) if src.is_relative_to(raiz) else src}")
        try:
            for s in RENDER[src.suffix](src.resolve(), out):
                print(f"  → {s.relative_to(raiz)}")
        except Exception as e:  # noqa: BLE001
            errores += 1
            print(f"  ERROR: {e}", file=sys.stderr)
    sys.exit(1 if errores else 0)


if __name__ == "__main__":
    main()
