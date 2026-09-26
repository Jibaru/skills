# Formato de ficha por documento

Una ficha por PDF en `literatura/fichas/<nombre-del-pdf-sin-.pdf>.md`. La escribe un
subagente que leyó el documento entero (o por secciones si es largo). `matriz.py`
consolida todas las fichas en `matriz-revision.csv`, así que **respeta exactamente
las claves del encabezado y los títulos `##`**.

Reglas para quien escribe la ficha:

- Todo lo que pongas sale del documento. Si un dato no está, escribe `No reporta`. Nunca lo deduzcas ni lo completes con conocimiento general.
- Las secciones descriptivas van parafraseadas en español, con tus palabras. Las únicas frases literales son las de `## Citas textuales`.
- Cada cita textual lleva la página **impresa** en el documento. Si no hay número impreso, usa la del PDF y márcalo: `(p. 7 del PDF)`. Si ambas difieren, anota las dos.
- Los indicadores y fórmulas se copian tal cual (en LaTeX si es posible), con su página. Son la base para justificar los indicadores de la tesis, así que no los omitas.
- El párrafo de antecedente sigue la plantilla del curso (un solo párrafo, cita narrativa, sin número de página): autor y año, lugar, objetivo, población/muestra y diseño, instrumentos, resultados principales con cifras, conclusión vinculada al objetivo.
- `sirve_como_antecedente: si` solo si el trabajo comparte **objetivo y variables** con la tesis (regla CL7 del curso). Si solo aporta teoría o un indicador, `no` y explícalo en `## Aporte a la tesis`.

## Plantilla

```markdown
---
id: C0031                      # id de candidatos.csv, vacío si el PDF vino suelto
archivo: 2026-leonardo-percepcion-impacto-chatbot-atencion-cliente.pdf
anio: 2026
titulo: Percepción del impacto de un chatbot en la atención al cliente ...
autores: López, L.; Pérez, M.
pais: Perú
ambito: nacional               # nacional | internacional
tipo: articulo                 # articulo | revision | conferencia | tesis-pregrado | tesis-maestria | tesis-doctorado | libro | informe
repositorio: SciELO            # base de datos o repositorio donde está indexado/publicado (Scopus, IEEE Xplore, MDPI, ALICIA, repositorio UCV...)
revista: Revista X             # revista, congreso o universidad
doi: 10.24215/23143738e181
url: https://doi.org/10.24215/23143738e181
idioma: es
bibkey: lopez2026percepcion    # clave en bib/referencias.bib (la asigna tesis-referencias)
paginas_pdf: 12
relevancia: alta               # alta | media | baja
sirve_como_antecedente: si     # si | no
variables_tesis: VD            # VI | VD | ambas | ninguna  (según tesis.yaml)
---

## Objetivo
Parafraseo del objetivo del estudio.

## Metodología
Enfoque, tipo, nivel, diseño (p. ej. pre-experimental O1 X O2), metodología de desarrollo del software si la hay (Scrum, RUP...).

## Población y muestra
Población, muestra, muestreo. Cifras exactas.

## Instrumentos
Técnica e instrumento (cuestionario Likert de N ítems, ficha de registro...), validez y confiabilidad reportadas (juicio de expertos, alfa de Cronbach = 0,87...).

## Resultados
Resultados principales con cifras (antes/después, p-valor, prueba estadística usada).

## Conclusión
Conclusión de los autores vinculada a su objetivo.

## Indicadores y fórmulas
- Tiempo promedio de respuesta: $TPR = \frac{\sum t_i}{n}$ (p. 6), unidad: minutos.
- Nivel de satisfacción: escala Likert 1–5 (p. 7).

## Aporte a la tesis
- VD / dimensión "Eficiencia": justifica el indicador TPR y su medición pre/post.
- Bases teóricas: definición de chatbot (p. 3).

## Citas textuales
- "texto literal de menos de 40 palabras" (p. 4)
- "otra cita" (p. 9; p. 11 del PDF)

## Párrafo de antecedente
López y Pérez (2026) desarrollaron en Lima, Perú, una investigación con el objetivo de ...; trabajaron con una muestra de ...; aplicaron ...; encontraron que ..., concluyendo que ...

## Limitaciones
Limitaciones que declaran los autores o que se observan (muestra pequeña, sin grupo control...).
```

## Documentos largos (`estrategia: por-secciones` en `indice.csv`)

1. `python scripts/extraer.py <pdf>` escribe `literatura/texto/<nombre>.txt` con marcadores `=== p N ===` y muestra el índice o los inicios de sección.
2. Lee en este orden: resumen, índice, introducción/problema, metodología, resultados, conclusiones. Usa `extraer.py <pdf> --paginas N-M` para cada tramo.
3. En tesis, prioriza la operacionalización de variables, la matriz de consistencia, los instrumentos (anexos), la contrastación de hipótesis y las conclusiones. El marco teórico solo interesa por las definiciones con su autor original, que se citan de la fuente primaria, no de la tesis.
4. La ficha tiene el mismo formato; añade en `## Metodología` las páginas de cada sección leída.
