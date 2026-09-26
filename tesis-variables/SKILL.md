---
name: tesis-variables
description: Define el Capítulo III (Variables e hipótesis) de un plan de tesis o tesis UNTELS de Ingeniería de Sistemas — variables independiente y dependiente, dimensiones, indicadores con fórmula, unidad, escala e instrumento, hipótesis general y específicas con su H0/H1 por indicador, y la matriz de consistencia — todo en tesis.yaml y generado a LaTeX. Usar cuando el usuario diga "capítulo 3", "operacionalización", "matriz de operacionalización", "variables e hipótesis", "dimensiones e indicadores", "KPIs de la tesis", "hipótesis", "matriz de consistencia", o cuando la skill tesis delegue la fase de variables.
metadata:
  author: Jibaru
  version: 1.0.0
---

# tesis-variables

Esta skill es dueña de `variables` e `hipotesis` en `tesis.yaml` y escribe la prosa corta de `capitulos/03-variables.tex`:

- 3.1 Definición operacional de las variables: un párrafo introductorio y `\input{generado/operacionalizacion.tex}`.
- 3.2 Hipótesis: `\input{generado/hipotesis.tex}`.

La matriz de consistencia (Anexo 1) se genera sola desde el YAML.

Es el eslabón que el jurado revisa con más rigor: **coherencia vertical** título → problema → objetivo → variable → dimensión → indicador → hipótesis → diseño → instrumento.

Lee antes:

- `../tesis/references/tesis-yaml.md` (esquema de `variables`, `indicadores` y `sentido`).
- `../tesis/references/reglas-curso.md`, secciones Hipótesis y variables, y Matriz de consistencia.
- `references/indicadores.md` (de esta skill): catálogo de indicadores típicos para sistemas de atención por mensajería con IA.

## Requisitos

- `problema` y `objetivos` ya están en `tesis.yaml` (viene de `tesis-problema`).
- Bases teóricas de las variables, al menos en borrador (`tesis-marco`). Si no existen, puedes proponer indicadores a partir de `literatura/fichas/*.md`, pero cada uno debe apuntar a la ficha o cita que lo respalda.

## Flujo

1. **Leer el estado.** Lee `ESTADO.md` y `tesis.yaml`, y extrae de las fichas qué indicadores y fórmulas usan los antecedentes.
2. **Ronda de grilling.** Formato `❓ Qn` / `➡️`, con estas preguntas:
   - **VI.** Nombre exacto, igual al del título. Tipo: cualitativa. ¿Tiene dimensiones medibles? Si es solo el tratamiento, se describe sin dimensiones. **Nunca uses "Sí / No" o "Con / Sin el aplicativo" como dimensiones**: ese error está en el proyecto anterior de Ignacio.
   - **VD.** Nombre exacto, igual al del título. ¿Cuántas dimensiones? Si la variable es compleja, lleva mínimo 2 dimensiones con 2 indicadores cada una. Las dimensiones salen del enfoque teórico adoptado en 2.2.
   - **Indicadores.** Para cada uno: fórmula, unidad, escala, instrumento y **sentido** (`baja` o `sube`). Confirma con la persona **de dónde saldrá el dato real**: logs del sistema, base de datos, registros previos de la empresa o encuesta. Si el dato no se puede obtener, el indicador no sirve y se reemplaza.
   - **Correspondencia.** A qué problema u objetivo específico responde cada indicador (`especifico: i`). Cada específico debe tener al menos un indicador.
   - **Hipótesis.** Si se enuncian por dimensión o por indicador. Lo recomendado es una hipótesis específica por problema específico.
3. **Escribir en `tesis.yaml`**, respetando el esquema.
4. **Generar.** Corre `python ../tesis/scripts/generar.py`. Si falla por falta de alineación o por un indicador sin `especifico`, corrige el YAML y no el script.
5. **Revisar el `.tex` generado.** Compila (lo hace la skill `tesis`, o `bash ../tesis/scripts/compilar.sh`) y mira la tabla de operacionalización en el PDF: que no se corten columnas, que tenga orientación horizontal si hace falta y que se vea la *Nota.*
6. **Autorrevisión.** Aplica el checklist y el criterio 7 de la rúbrica.
7. **Actualizar `ESTADO.md`.** Anota además qué dato hay que recolectar por indicador, porque esa lista la necesita `tesis-metodologia`.

## Reglas

### Variables
- Los nombres de la VI y la VD se escriben **idénticos** en el título, el problema, el objetivo, la hipótesis y la matriz.
- La variable no puede ser una herramienta aislada ("Python") ni un entregable ("el informe").
- **Definición conceptual:** viene de autores y es la misma de 2.2, con cita.
- **Definición operacional:** explica **cómo se medirá**. Ejemplo: "Se medirá a través de la oportunidad y la resolutividad de la atención, mediante indicadores obtenidos de los registros del sistema y consignados en una ficha de registro".
- Tipo de variable según su naturaleza: cualitativa o cuantitativa.

### Indicadores
- Deben ser observables, concretos y viables en el periodo de estudio, y estar **respaldados por un antecedente o autor**.
- **Fórmula** en LaTeX matemático y **unidad** explícita (minutos, %, conversaciones/día).
- **Escala:** nominal, ordinal, de intervalo o de razón. Los tiempos, conteos y porcentajes son de razón.
- **Instrumento:** ficha de registro (datos del sistema o de la empresa), cuestionario (percepción) o guía de observación.
- El **sentido** define la contrastación que hará `tesis-resultados`:
  - `baja` (tiempos, errores, costos): H0: μ_pre ≤ μ_post; H1: μ_pre > μ_post.
  - `sube` (tasas, satisfacción, precisión): H0: μ_pre ≥ μ_post; H1: μ_pre < μ_post.
- Si el indicador es una encuesta de satisfacción, recuerda que no hay pre-prueba cuando el sistema no existía. Adviértelo y deja la decisión a `tesis-metodologia`.
- Las fórmulas de precisión, recall y demás se escriben completas y bien cerradas. En el proyecto anterior faltaban un corchete y el ×100.

### Hipótesis
- Son **afirmativas**, están referidas a la unidad y el lugar, y son **verificables con el diseño pre-experimental**. Usa verbos de efecto (reduce, incrementa, mejora) solo cuando el diseño mide pre y post.
- **General:** "[VI] mejora [VD] en [unidad] de [lugar]".
- **Específicas:** una por problema específico, con el indicador y su dirección. Ejemplo: "El sistema web … reduce el tiempo promedio de primera respuesta a consultas de clientes en …".
- **Prohibido:**
  - Hipótesis que no se pueden contrastar, como "se determinará la implementación más eficaz…", "…se realiza satisfactoriamente" o "…es precisa". Todas son errores reales.
  - Hipótesis que repiten el objetivo.
  - Introducir variables nuevas.
- Las H0 y H1 estadísticas por indicador **no** van en 3.2. Van en resultados, porque `tesis-resultados` las genera desde `sentido`.

### Matriz de consistencia
- La genera el script: problemas | objetivos | hipótesis | variables, dimensiones e indicadores | metodología. Cada fila i alinea el problema i, el objetivo i y la hipótesis i.
- Si una celda de metodología queda vacía (tipo, nivel, diseño, población, muestra, técnica o instrumento), avisa a `tesis-metodologia`. Una matriz con celdas vacías es una observación típica del jurado.

## Checklist antes de mostrar

- [ ] La VI y la VD se nombran igual en el título, en `problema.general`, en `objetivos.general` y en `hipotesis.general`.
- [ ] Si la VD es compleja, tiene al menos 2 dimensiones con 2 indicadores cada una, y cada dimensión e indicador tiene cita.
- [ ] Cada indicador tiene fórmula, unidad, escala, instrumento, `sentido`, `especifico` y una fuente real de datos confirmada.
- [ ] Cada problema u objetivo específico tiene al menos un indicador. `len(hipotesis.especificos) == len(problema.especificos)`.
- [ ] Ninguna dimensión es "Sí/No" ni "Con/Sin".
- [ ] Las hipótesis son afirmativas, contrastables y sin variables nuevas.
- [ ] `generar.py` corre sin errores y la tabla se ve completa en el PDF.
- [ ] Las definiciones conceptuales son idénticas a las de 2.2.
