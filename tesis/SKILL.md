---
name: tesis
description: Orquesta la elaboración del plan de tesis y la tesis de Ingeniería de Sistemas en la UNTELS (Perú) en LaTeX, fase por fase, con el formato oficial, la rúbrica del jurado y APA 7 en español. Crea el proyecto, lleva el estado, decide la siguiente fase y delega en las skills tesis-*. Úsala cuando el usuario diga "mi tesis", "plan de tesis", "empezar la tesis", "en qué voy de la tesis", "siguiente paso de la tesis", "pasar el plan a tesis", "compilar la tesis", "tengo un software y quiero hacer la tesis sobre él", o pida ayuda con cualquier parte de la tesis y no haya una skill tesis-* más específica.
metadata:
  author: Jibaru
  version: 1.0.0
---

# tesis

Esta skill mantiene el proyecto de tesis en orden y delega el trabajo de cada fase en
su skill. No redacta capítulos: decide qué fase toca, verifica que la anterior esté
cerrada y que todo siga siendo coherente.

```
arranque → literatura → I problema → II marco → III variables → IV metodología
        → [plan listo: jurado → levantar observaciones]
        → implementación y medición → resultados → discusión/conclusiones
        → [tesis lista: jurado → sustentación]
```

## Referencias compartidas

Todas las skills `tesis-*` leen estas referencias. No dupliques su contenido.

| Archivo | Para qué |
|---|---|
| `references/estructura.md` | Estructuras oficiales de plan y tesis, con y sin hipótesis, y el paso de plan a tesis |
| `references/formato-untels.md` | Página, títulos, tablas y figuras, carátulas, numeración |
| `references/reglas-curso.md` | Reglas metodológicas del curso por fase y contradicciones resueltas |
| `references/apa7-es.md` | Citas y referencias APA 7 en español |
| `references/jurado.md` | Rúbrica oficial, guía del jurado, errores comunes, criterios de sustentación |
| `references/estilo-ignacio.md` | Voz de escritura, defectos a corregir, antipatrones prohibidos |
| `references/tesis-yaml.md` | Esquema de `tesis.yaml` |

## Skills de fase

| Skill | Fase |
|---|---|
| `tesis-literatura` | Búsqueda, descarga, análisis en paralelo de papers y tesis, matriz de revisión |
| `tesis-referencias` | `referencias.bib` verificado y chequeo cita ↔ referencia |
| `tesis-problema` | Cap. I: descripción, formulación, objetivos, delimitación, justificación, título |
| `tesis-marco` | Cap. II: antecedentes, bases teóricas, términos básicos |
| `tesis-variables` | Cap. III: operacionalización, hipótesis, matriz de consistencia |
| `tesis-metodologia` | Cap. IV: diseño, población y muestra, instrumentos, validez, cronograma, presupuesto |
| `tesis-resultados` | Estadística, 4.6 resultados, discusión, conclusiones, recomendaciones |
| `tesis-figuras` | Diagramas, gráficos, capturas del sistema |
| `tesis-jurado` | Revisión con la rúbrica, coherencia vertical, originalidad |

## Proyecto de tesis

La tesis vive en su propio repositorio, nunca dentro del repo de skills.

```
tesis/
├── tesis.yaml              # fuente de verdad estructural (references/tesis-yaml.md)
├── ESTADO.md               # fase actual, decisiones, pendientes
├── main.tex · untels.cls
├── capitulos/              # prosa de cada capítulo
├── generado/               # .tex generados desde tesis.yaml — no editar
├── bib/referencias.bib
├── figuras/{src,out}/
├── literatura/{pdfs,fichas}/ · matriz-revision.csv · busquedas.md · PENDIENTES.md
├── datos/                  # pre/post y resultados
├── anexos/
└── revisiones/             # informes de tesis-jurado
```

| Tarea | Comando (desde el proyecto) |
|---|---|
| Crear proyecto | `bash <skills>/tesis/scripts/nuevo-proyecto.sh <destino>` (`.ps1` en Windows) |
| Regenerar desde `tesis.yaml` | `python <skills>/tesis/scripts/generar.py` |
| Compilar PDF | `bash <skills>/tesis/scripts/compilar.sh` (Docker `texlive/texlive`) |
| Exportar Word | `bash <skills>/tesis/scripts/exportar-docx.sh` (Docker `pandoc/latex`) |

`<skills>` es el directorio de skills instaladas (normalmente `~/.claude/skills`).

## Arranque

1. **Busca un proyecto existente**: `tesis.yaml` en el directorio actual o el que
   indique el usuario. Si existe, lee `ESTADO.md` y ve a "Retomar".
2. **Crea el proyecto**: pregunta dónde (recomienda un repo aparte, privado), corre
   `nuevo-proyecto`, rellena `meta` en `tesis.yaml` (autores, asesor, año, carátula).
   Verifica que Docker funcione y compila la plantilla vacía una vez.
3. **Elige el punto de entrada** con una ronda de preguntas (formato de la skill
   `grilling`: ❓ Qn con ➡️ recomendación):
   - **Software primero**: el usuario ya tiene el sistema hecho o planificado. Analiza
     el repositorio (stack, módulos, arquitectura, qué datos guarda, qué registra) con
     subagentes y **luego entrevista**: el código no dice quién lo usa, desde cuándo,
     qué problema resolvía, cómo se hacía antes, qué datos del proceso anterior
     existen, si ya está en producción. De ahí salen la VI (el sistema), la VD (el
     proceso que cambia), los KPIs medibles antes y después y la unidad de estudio.
     Registra todo en `ESTADO.md` y pasa a `tesis-problema` con esa base.
   - **Problema primero**: el camino clásico. Pasa a `tesis-literatura` para mapear el
     estado del arte y luego a `tesis-problema`.
4. Escribe en `ESTADO.md` la fase actual y las decisiones tomadas.

## Retomar

Lee `ESTADO.md` y `tesis.yaml`, di en una línea dónde está la tesis y propón la
siguiente acción. Orden por defecto: literatura → I → II → III → IV → jurado. Se puede
volver atrás; si una fase cambia algo estructural (título, variable, indicador), marca
las fases dependientes como "revisar" en `ESTADO.md`.

## Coherencia vertical

Después de cada fase y antes de compilar:

1. `python <skills>/tesis/scripts/generar.py` debe terminar sin errores (valida
   alineación problema ↔ objetivo ↔ hipótesis, longitud del título e indicadores).
2. Revisa que el título, la VI, la VD y la unidad de estudio se nombren igual en
   `tesis.yaml` y en la prosa de los capítulos.
3. Si hay citas nuevas: `python <skills>/tesis-referencias/scripts/bib.py check`.

## Plan → tesis

Cuando el plan está aprobado y hay resultados medidos:

1. Cambia `meta.modo` a `tesis`.
2. Sigue `references/estructura.md`, sección "Del plan a la tesis": tiempos verbales
   a pasado, 4.2.1 con lo realmente implementado, 4.2.2 pruebas, 4.5 validez y
   confiabilidad con evidencia, preliminares, introducción, resumen y abstract.
3. Pasa a `tesis-resultados`.
4. Cierra con `tesis-jurado` en modo tesis.

## ESTADO.md

```markdown
# Estado de la tesis
Fase actual: III. Variables e hipótesis
Modo: plan · Con hipótesis: sí · Entrada: software primero

## Fases
| Fase | Estado | Última revisión |
| Literatura | cerrada (27 fichas, 8 antecedentes) | 2026-09-30 |
| I. Problema | cerrada | 2026-10-02 |
| II. Marco | revisar (cambió indicador TPR) | 2026-10-05 |
...

## Decisiones
- 2026-09-28 · VD = gestión de la atención al cliente; KPIs: TPR, TRC, NSC.
- ...

## Pendientes
- [ ] Conseguir PDFs de PENDIENTES.md (3)
- [ ] Carta de autorización de la organización
```

## Reglas

- Nunca inventes datos, cifras, referencias ni DOI. Sin fuente, no hay afirmación.
- Todo lo estructural va en `tesis.yaml`; la prosa, en `capitulos/`.
- Las decisiones son del usuario; los hechos (código, APIs, normas, precios) los
  averiguas tú.
- La voz es la de `references/estilo-ignacio.md`.
- Antes de dar una fase por cerrada, la skill de fase se autorrevisa con
  `references/jurado.md`.
