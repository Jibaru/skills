---
name: tesis-problema
description: Redacta el Capítulo I (Planteamiento del problema) de un plan de tesis o tesis UNTELS de Ingeniería de Sistemas en LaTeX — título, descripción del problema (realidad problemática con motivación y estado del arte), formulación de problemas, objetivos, delimitación, justificación y alcance — entrevistando primero al tesista y dejando lo estructural en tesis.yaml. Usar cuando el usuario diga "capítulo 1", "planteamiento del problema", "realidad problemática", "formular el problema", "objetivos de la tesis", "justificación", "delimitación", "título de la tesis", o cuando la skill tesis delegue la fase de problema.
metadata:
  author: Jibaru
  version: 1.0.0
---

# tesis-problema

Produce `capitulos/01-problema.tex` y las claves `meta.titulo`, `delimitacion`,
`problema` y `objetivos` de `tesis.yaml`. El Capítulo I es el que fija la coherencia
de toda la tesis: título ↔ problema ↔ objetivo ↔ variables. Si aquí queda mal, el
jurado lo observa como **CRÍTICA**.

Lee antes de empezar:

- `../tesis/references/tesis-yaml.md`: el contrato de `tesis.yaml`.
- `../tesis/references/reglas-curso.md`: las secciones Problema, Objetivos y Justificación.
- `../tesis/references/estilo-ignacio.md`: la voz que debes usar.
- `../tesis/references/estructura.md`: la numeración (1.1 a 1.5).
- `references/patrones.md` (de esta skill): plantillas de preguntas, verbos y ejemplos buenos y malos.

## Flujo

1. **Estado.** Lee `ESTADO.md` y `tesis.yaml`. Si ya existe `01-problema.tex`, trabaja sobre él. No lo reescribas desde cero.
2. **Punto de entrada.** Pregunta cuál aplica, si `ESTADO.md` no lo dice:
   - **Software primero.** Existe (o está planeado) un sistema. Lee el repositorio junto con la persona: stack, módulos, qué automatiza y qué datos guarda. El código no dice quién lo usa, desde cuándo, qué problema resolvía, cómo se hacía antes ni qué registros previos hay. **Pregúntalo.** De ahí sale la VD: lo que el sistema cambia y se puede medir.
   - **Problema primero.** Parte de la organización o el proceso y de su síntoma, y llega a la solución tecnológica al final.
3. **Grilling de la fase.** Una ronda con el formato `❓ **Qn** - **título**: …` / `➡️ recomendación`. Pregunta solo lo que esta fase decide:
   - La unidad de estudio y el lugar: empresa, área, proceso, distrito.
   - El síntoma observable y **con qué cifra se evidencia**. Si la cifra es interna, pregunta de dónde sale, por ejemplo registros o una entrevista al encargado.
   - La VI (la solución) y la VD (el efecto medible) provisionales. `tesis-variables` las afina después.
   - Cuántos problemas específicos habrá. Normalmente uno por dimensión o indicador clave de la VD, entre 2 y 4.
   - Si la descripción va con ámbitos (internacional, nacional, local) o en prosa continua.
   - Las justificaciones que aplican: teórica, práctica o tecnológica, metodológica, social y económica.

   Los hechos (estadísticas de uso de WhatsApp, adopción de IA en Perú, cifras del sector) **los buscas tú** con `tesis-literatura` o WebSearch. No se los pidas a la persona.
4. **Redacta** en este orden: título → problema general → objetivo general → específicos (problema i ↔ objetivo i) → 1.1 → 1.4 → 1.5. Escribir la formulación antes que la descripción evita una realidad problemática que no desemboca en la pregunta.
5. **Actualiza `tesis.yaml`** y ejecuta `python ../tesis/scripts/generar.py` (o el comando de `ESTADO.md`). Corrige el script si falla por alineación.
6. **Autorrevisión** con el checklist de abajo y con los criterios 1 a 5 de la rúbrica (`../tesis/references/jurado.md`). Corrige antes de mostrar.
7. **Muestra** un resumen: el título, el problema, el objetivo y las observaciones pendientes. Actualiza `ESTADO.md` con la fase, las decisiones y lo pendiente, como "falta cifra de X".

## Contenido por sección

### Título
- Máximo **15 palabras de contenido**. No cuentan artículos, preposiciones, conectores ni el nombre de la organización.
- Contiene la VI, la VD y la unidad o el lugar. Patrón: `[VI] para [verbo de efecto / VD] en [unidad] de [lugar]`.
- Va en MAYÚSCULAS y entre comillas en la carátula. Eso lo genera `generar.py`.
- Si se repite la variable, está mal. Error real: "Implementación de redes neuronales… para determinar la efectividad de la aplicación de redes neuronales…".

### 1.1 Descripción del problema
- **De lo general a lo particular:** contexto internacional → nacional → local (la organización). En Perú, cita fuentes como INEI, OSIPTEL, MTC, IPSOS o GfK Perú.
- **Secuencia:**
  1. Contexto.
  2. Situación ideal: lo que ya logran otros con la tecnología. Aquí entran la **motivación** y el **estado del arte**, que la rúbrica evalúa (criterio 2): tecnologías vigentes, vacíos y oportunidades.
  3. "Sin embargo…": la situación real de la unidad de estudio.
  4. Síntomas con cifras → causas → pronóstico (qué pasa si no se interviene) → control al pronóstico (la solución propuesta, en una o dos oraciones al final).
- El problema es la **brecha P = SR − SI**. Tiene que quedar explícito qué indicador está mal y cuánto.
- **Toda afirmación lleva cita.** Las cifras deben ser recientes, dentro de la ventana `meta.antecedentes_ventana_anios` cuando sea posible.
- Tercera persona y sin figuras literarias. Las citas textuales van entre comillas y con página, pero de preferencia parafrasea.
- Longitud orientativa: 2 a 4 páginas. **No** es una lista de resúmenes de papers: eso va en antecedentes.
- Cierra con un párrafo puente hacia la pregunta, por ejemplo "Ante esta situación, resulta necesario determinar…".

### 1.2 Formulación del problema
- Se genera desde `tesis.yaml`. Solo escribe las preguntas en el YAML.
- **General:** contiene VI + VD + unidad + lugar. Para un diseño explicativo pre/post usa `¿En qué medida [VI] [mejora/reduce/incrementa] [VD] en [unidad] de [lugar]?` o `¿Cuál es el efecto de [VI] en [VD] de [unidad]?`.
- **Específicos:** uno por dimensión o indicador de la VD, con la misma forma que el general. Ejemplo: "¿En qué medida el sistema web … reduce el tiempo de respuesta a consultas de clientes en …?".
- **Prohibido:** preguntas que son actividades, como "¿Cómo implementar…?" o "¿Cómo medir…?". También términos ambiguos ("eficacia" sin definir) y variables que no están en el título.

### 1.3 Objetivos
- Van en infinitivo y cada uno tiene su problema: **objetivo i ↔ problema i**. El general se forma así: `Determinar en qué medida [VI] [efecto] [VD] en [unidad] de [lugar]`.
- Verbos recomendados: determinar, evaluar, establecer, comprobar, verificar, analizar, describir, diseñar. Evita **mejorar**, conocer, capacitar, hacer y enseñar, y no pongas frases antes del verbo.
- **Nada de "Implementar un sistema…" como objetivo específico.** La construcción del software es un medio que se describe en 4.2, no un objetivo de investigación, y el jurado lo observa como "objetivos que son actividades". El mismo error aparece en el proyecto anterior de Ignacio.
- Cada específico debe poder responderse con un indicador medido. Si no se mide, no es objetivo.

### 1.4 Delimitación
- **Espacial:** la organización, la sede, el distrito o la provincia.
- **Temporal:** el periodo de recolección pre y post, en meses y año.
- **Metodológica** (opcional, 1.4.3): qué indicadores, qué canal (solo WhatsApp) y qué población.
- El **alcance** va aquí o al final de 1.5, en un párrafo que diga explícitamente qué **no** pretende la investigación. Ejemplo: "no pretende evaluar la satisfacción…", "no abarca otros canales de atención…".

### 1.5 Justificación
Usa subsecciones 1.5.1 a 1.5.n con las que apliquen. Cada una tiene 1 o 2 párrafos **con al menos una cifra o una cita**:
- **Teórica:** qué aporta o contrasta del conocimiento, por ejemplo sobre la aplicación de LLM a la atención por mensajería.
- **Práctica o tecnológica:** qué problema concreto resuelve y a quién beneficia.
- **Metodológica:** los instrumentos o procedimientos que quedan reutilizables, como la ficha de registro o el procedimiento de medición desde logs.
- **Social:** el beneficio para los usuarios o clientes.
- **Económica:** ahorro estimado, costo frente a beneficio, con números del presupuesto o cotizados.

Cierra con "La presente investigación contribuirá a…". Evita frases genéricas sin respaldo, como "las redes neuronales son una forma increíble…" (error real).

## Checklist antes de mostrar

- [ ] Título de 15 palabras de contenido o menos, con VI, VD y unidad/lugar, sin repetir la variable.
- [ ] `len(problema.especificos) == len(objetivos.especificos)` y cada par dice lo mismo en forma de pregunta y de infinitivo.
- [ ] El problema general, el objetivo general y el título nombran las mismas variables con las mismas palabras.
- [ ] Ningún objetivo ni problema es una actividad: implementar, desarrollar, diseñar el sistema.
- [ ] Todas las afirmaciones de 1.1 y 1.5 tienen `\parencite`/`\textcite` con claves que existen en `bib/referencias.bib`. Las que no existan se piden a `tesis-referencias`.
- [ ] Hay al menos una cifra que muestra la brecha en la unidad de estudio.
- [ ] El tiempo verbal es coherente con `meta.modo`: futuro en plan ("se desarrollará") y pasado en tesis ("se desarrolló").
- [ ] Todo en tercera persona impersonal y sin "et. al.".
- [ ] No hay párrafos copiados: las definiciones y cifras están parafraseadas con cita (ver `tesis-jurado`).
