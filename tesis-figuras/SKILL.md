---
name: tesis-figuras
description: Crea las figuras de la tesis UNTELS en formato APA. Cubre diagramas de arquitectura, secuencia, casos de uso, procesos AS-IS/TO-BE, modelo entidad-relación, diseño pre-experimental y embudo de revisión de literatura (Mermaid o PlantUML), gráficos estadísticos (matplotlib) y capturas automáticas del sistema web (Playwright). Las fuentes quedan versionadas para regenerarlas. Úsala cuando el usuario diga "haz un diagrama", "diagrama de arquitectura", "diagrama de secuencia", "casos de uso", "BPMN", "proceso AS-IS / TO-BE", "modelo ER", "gráfico", "captura de pantalla del sistema", "regenera las figuras" o "inserta una figura".
metadata:
  author: Jibaru
  version: 1.0.0
---

# tesis-figuras

Toda figura de la tesis nace de una **fuente de texto** guardada en `figuras/src/` y se
renderiza a `figuras/out/`. Nunca se pegan imágenes dibujadas a mano si se pueden generar.
Así se regeneran cuando cambie el sistema y el jurado no ve estilos distintos entre
figuras.

```
figuras/src/*.mmd   Mermaid   → figuras/out/<nombre>.pdf + .png
figuras/src/*.puml  PlantUML  → figuras/out/<nombre>.png + .svg
figuras/src/*.py    matplotlib → lo que guarde el script (recibe FIG_OUT, FIG_ANCHO_CM)
capturas.json       Playwright → figuras/out/<nombre>.png
```

## Antes de empezar

1. Lee `ESTADO.md`, `tesis.yaml` y el capítulo donde irá la figura, para saber qué debe
   mostrar y qué se afirma de ella en el texto.
2. Formato APA: `../tesis/references/apa7-es.md`, sección de figuras.
   Formato UNTELS: `../tesis/references/formato-untels.md`.
3. Si la figura describe **el sistema real** (arquitectura, ER, secuencia, casos de uso),
   lee el repositorio del sistema antes de dibujar: rutas, modelos, migraciones y
   servicios externos. **Pregunta al usuario** lo que el código no dice, por ejemplo qué
   actores existen en la organización o qué paso hace una persona. No inventes
   componentes que el sistema no tiene.

## Ronda de preguntas

Formato `grilling` (❓ **Qn** / ➡️ recomendación). Solo pregunta lo que no puedas deducir:
qué figura se necesita y para qué sección, nivel de detalle, si hay datos personales en
pantalla que ocultar, y dónde corre el sistema para las capturas (URL, usuario de prueba).

## Plantillas

En `assets/diagramas/` hay plantillas del tema (WhatsApp + OpenAI). Cópialas a
`figuras/src/` y adáptalas:

| Plantilla | Uso típico en la tesis |
|---|---|
| `arquitectura.mmd` | 4.2.1 Implementación: arquitectura de la solución |
| `secuencia-mensaje.puml` | Implementación: flujo de un mensaje (webhook → backend → OpenAI) |
| `casos-de-uso.puml` | Análisis de requerimientos (Sprint 0 / RUP) |
| `proceso-asis.mmd`, `proceso-tobe.mmd` | 1.1 Descripción del problema (AS-IS) y propuesta (TO-BE) |
| `er.mmd` | Diseño de la base de datos |
| `diseno-preexperimental.mmd` | 4.1 Diseño de investigación (GE: O1 X O2) |
| `embudo-literatura.mmd` | Revisión de literatura (cifras de `literatura/busquedas.md`) |
| `grafico-ejemplo.py` | Gráficos propios en estilo APA (barras, líneas) |

Los gráficos de resultados (boxplot, medias) los genera `tesis-resultados`. No los dupliques.

Reglas de estilo para cualquier diagrama:

- Fondo blanco, escala de grises o tema `neutral`, fuente sans-serif (Arial). En PlantUML,
  `skinparam monochrome true` y `skinparam dpi 300`.
- **Sin título dentro de la imagen**: el título va en `\caption`.
- Texto en español, legible a 15,5 cm de ancho (la mancha tipográfica). Si el diagrama es
  muy ancho, cambia la dirección (`flowchart TB`) o divídelo en dos figuras.
- Nombres consistentes con el texto de la tesis: si en 2.2 se llama "API de OpenAI", en el
  diagrama también.

## Renderizar

```bash
python ../tesis-figuras/scripts/figura.py --proyecto . todo            # solo lo modificado
python ../tesis-figuras/scripts/figura.py --proyecto . todo --forzar   # todo
python ../tesis-figuras/scripts/figura.py --proyecto . figuras/src/arquitectura.mmd
```

Dependencias:

- Mermaid usa `npx @mermaid-js/mermaid-cli@12` (Node). Si no hay Node, usa Docker
  `minlag/mermaid-cli`.
- PlantUML usa Docker `plantuml/plantuml`, o `PLANTUML_JAR=/ruta/plantuml.jar` con Java.
- matplotlib necesita `pip install matplotlib`.

**Siempre abre el PNG resultante con Read y míralo** antes de insertarlo. Revisa texto
cortado, flechas cruzadas ilegibles o nodos apretados. Corrige la fuente y vuelve a
renderizar.

## Capturas del sistema

Crea `figuras/src/capturas.json`. El formato está documentado al inicio de
`scripts/captura.mjs`: URL base, viewport y una lista de capturas con pasos (`llenar`,
`clic`, `esperar`…), `selector` para recortar y `ocultar` para difuminar datos personales.

```bash
npm i -D playwright && npx playwright install chromium   # una vez, en el proyecto
DEMO_PASSWORD=... node ../tesis-figuras/scripts/captura.mjs --proyecto . figuras/src/capturas.json
```

Reglas:

- **Datos personales**: usa datos de prueba o difumina (`ocultar`) teléfonos, nombres y
  mensajes reales de clientes. La rúbrica evalúa protección de datos (criterio 11).
- Credenciales solo por variables de entorno (`valorEnv`), nunca en el JSON.
- Viewport 1366×768 con escala 2 para que se lea impreso.
- Una captura por pantalla relevante del proceso. Nada de capturas decorativas.

## Insertar en LaTeX

Usa `assets/insertar-figura.tex`. El orden APA en UNTELS es este: etiqueta "Figura N" en
negrita arriba, título en cursiva debajo, la imagen, y `\nota{...}` al final.

- Figura propia: `\nota{Elaboración propia.}`
- Tomada de un autor: `\nota{Tomado de \textcite{clave}.}` o `\nota{Adaptado de \textcite{clave}.}`.
  La clave debe existir en `bib/referencias.bib`, lo que se verifica con `tesis-referencias`.
- Captura: `\nota{Captura del sistema implementado. Elaboración propia.}`

Toda figura se **menciona en el texto antes de aparecer**
(`como se muestra en la Figura~\ref{fig:arquitectura}`) y se interpreta en una o dos
oraciones. Una figura que nadie menciona es una observación del jurado.

## Autorrevisión

- [ ] La fuente está en `figuras/src/` y la salida se regenera con `figura.py`.
- [ ] Revisaste el PNG visualmente y se lee a ancho completo.
- [ ] Tiene caption, label, `\nota{}` y mención en el texto.
- [ ] Refleja el sistema real y los nombres del texto.
- [ ] No expone datos personales.

Actualiza `ESTADO.md` con las figuras creadas y las pendientes.
