---
name: tesis-marco
description: Redacta el Capítulo II (Marco teórico) de un plan de tesis o tesis UNTELS de Ingeniería de Sistemas en LaTeX — antecedentes internacionales y nacionales recientes (un párrafo por antecedente a partir de las fichas de literatura), bases teóricas por variable, dimensión e indicador, y definición de términos básicos — parafraseando con citas APA 7 verificadas. Usar cuando el usuario diga "capítulo 2", "marco teórico", "antecedentes", "bases teóricas", "estado del arte de las variables", "términos básicos", "glosario de la tesis", o cuando la skill tesis delegue la fase de marco.
metadata:
  author: Jibaru
  version: 1.0.0
---

# tesis-marco

Produce `capitulos/02-marco.tex` con tres partes: 2.1 Antecedentes, 2.2 Bases teóricas y 2.3 Definición de términos básicos. En la rúbrica, el marco teórico vale **2 de 20** puntos. También es donde más marca Turnitin, sobre todo en las definiciones copiadas de libros aunque estén citadas.

Antes de empezar, lee:
- `../tesis/references/reglas-curso.md` (sección Marco teórico)
- `../tesis/references/apa7-es.md`
- `../tesis/references/estilo-ignacio.md`
- `references/plantillas.md` (de esta skill)

## Requisitos previos

- En `tesis.yaml` ya existen `variables` (al menos los nombres de la VI y la VD) y `problema`/`objetivos`. Si faltan, corre primero `tesis-problema`.
- En `literatura/fichas/*.md` hay fichas generadas por `tesis-literatura`.
- Si no hay fichas suficientes, **no inventes antecedentes**. Delega en `tesis-literatura` con la cadena de búsqueda de las variables y espera.
- Toda cita debe existir en `bib/referencias.bib`. Las entradas nuevas las crea `tesis-referencias` verificando el DOI. **Nunca escribas a mano una entrada con DOI supuesto.**

## Flujo

1. **Leer el estado.** Lee `ESTADO.md` y `tesis.yaml`, y lista las fichas disponibles con año, país, tipo (artículo o tesis) y qué variables comparten con la tesis.
2. **Grilling de la fase.** Una ronda con el formato `❓ Qn` / `➡️`. Estas son las preguntas:
   - **Selección de antecedentes.** Propón una tabla con los candidatos: autor, año, país, tipo, VI y VD que comparten, e indicadores que usan. Recomienda cuáles entran.
   - **Criterios de selección:**
     - Mínimo **5 internacionales + 3 nacionales**.
     - Año ≥ `meta.anio − meta.antecedentes_ventana_anios`.
     - Que compartan **objetivo y variables**: las dos, no solo la tecnología.
     - Priorizar artículos indexados y tesis de posgrado.
   - **Nacionales.** Si faltan, propón buscar en ALICIA, RENATI y repositorios peruanos antes de relajar criterios.
   - **Temas de 2.2.** Uno por variable, más las subsecciones de soporte tecnológico. Para este tema pueden ser: WhatsApp Business Platform / Cloud API, webhooks, modelos de lenguaje / API de OpenAI, chatbots y agentes conversacionales, y arquitectura del sistema web. Pregunta cuáles entran; no todo lo técnico va en el marco, y parte puede ir en 4.2.
   - **Enfoque teórico.** Qué enfoque o autor principal se adopta para definir la VD. Por ejemplo, el modelo de calidad de servicio que sustenta sus dimensiones.
3. **Redactar** en el orden 2.2 → 2.1 → 2.3. Primero se escriben las bases teóricas porque definen las dimensiones que los antecedentes deben respaldar.
4. **Sincronizar con variables.** Las definiciones conceptuales de variables y dimensiones que escribas aquí son las mismas que van a `tesis.yaml` (`definicion_conceptual`, `dimensiones[].definicion`). Actualízalas en el YAML para que la operacionalización quede idéntica.
5. **Autorrevisar** con el checklist y el criterio 6 de la rúbrica (`../tesis/references/jurado.md`). Luego pide a `tesis-jurado` el chequeo de originalidad del capítulo contra `literatura/pdfs/`.
6. **Actualizar `ESTADO.md`.** Anota qué antecedentes se usaron y qué falta.

## 2.1 Antecedentes

- Usa subsecciones **2.1.1 Antecedentes internacionales** y **2.1.2 Antecedentes nacionales**, ordenadas del más reciente al más antiguo o por afinidad temática. Mantén el mismo criterio en ambas.
- **Un párrafo por antecedente**, parafraseado, con cita narrativa `\textcite{clave}` al inicio y sin número de página. La plantilla es:

  Autor (año) + lugar + tipo de trabajo (si es tesis: "en su tesis para optar el título de…") + **objetivo** + diseño/muestra + instrumentos + **resultados con cifras** (antes → después, %, p-valor) + **conclusión** vinculada al objetivo.

- Los resultados deben incluir **números concretos** tomados de la ficha, por ejemplo "redujo el tiempo de respuesta de 12,4 a 3,1 minutos". Un antecedente sin cifras vale poco y el jurado lo nota.
- Cierra cada subsección con un párrafo breve de síntesis propia: qué comparten los antecedentes, qué indicadores usan y qué vacío deja la literatura para esta tesis. Así se evita que sea "una sucesión de resúmenes".
- **Errores reales que no deben repetirse:**
  - Antecedentes de 2010, 2013 o 2016 en un trabajo de 2023.
  - "et. al." en lugar de "et al.".
  - Citas con iniciales, como "Bilal, M. A. et. al. (2022)". La forma correcta es `\textcite` → "Bilal et al. (2022)".
  - Frases de plantilla repetidas en todos los párrafos ("con el objetivo de… Los resultados mostraron que…"). Turnitin las marcó. Varía los conectores. Ver `estilo-ignacio.md`.

## 2.2 Bases teóricas

- Hay una subsección por variable (2.2.1 VI y 2.2.2 VD), más las de soporte que se hayan acordado.
- Para **cada variable**:
  1. **Al menos 3 definiciones de 3 autores distintos**, integradas en prosa. No van como lista. Cierra con una síntesis propia: "Para efectos de la presente investigación, se entiende por… ".
  2. Características, tipos o componentes, solo los pertinentes.
  3. **Dimensiones**, cada una con su definición citada.
  4. **Indicadores**, con su definición y **fórmula** citadas. La fórmula va en entorno `equation` y se explica cada símbolo en un "Donde:" con lista. Los indicadores deben salir de autores o antecedentes, nunca "de la cabeza".
- Figuras y tablas: cuando ayuden (arquitectura WhatsApp → webhook → servidor → API de OpenAI, flujo de conversación), pídelas a `tesis-figuras`. Lleva la etiqueta arriba y *Nota.* abajo, con autoría (`Tomado de…`, `Adaptado de…` o `Elaboración propia`).
- **Qué no hacer:**
  - Contar historia irrelevante ("la historia de WhatsApp desde 2009…").
  - Hacer un inventario de definiciones sueltas; eso sería un glosario disfrazado.
  - Traducir literalmente un paper.
  - Copiar definiciones de libro con cita. Es **lo más marcado por Turnitin**.

  Parafrasea la idea: reestructura la oración, integra con otra fuente y relaciónala con la tesis. Cambiar sinónimos no basta; en el plan de otra alumna esa técnica degradó el texto ("con lleva", "entre lazar").
- Las citas textuales van entre comillas y con página, en menos de 40 palabras, y como excepción. Más de 40 palabras van en bloque `quote`, con el punto antes de "(p. x)".
- Extensión orientativa: 8 a 15 páginas. Prioriza lo que sustenta dimensiones e indicadores.

## 2.3 Definición de términos básicos

- Entre **10 y 20 términos**, en **orden alfabético**, **cada uno con cita**.
- Elige los que pueden confundir al lector, por ejemplo: API, chatbot, endpoint, LLM, prompt, token, webhook, WhatsApp Business Platform.
- El formato es el término en negrita, seguido de una definición parafraseada de 1 a 3 líneas y `\parencite{clave}`.
- No repitas las definiciones largas de 2.2. Aquí se definen de forma operativa y breve.

## Checklist antes de mostrar

- [ ] Hay al menos 5 antecedentes internacionales y 3 nacionales, todos con año ≥ `meta.anio − ventana`. Los que caigan en el límite de la ventana van señalados.
- [ ] Cada antecedente comparte objetivo y variables con la tesis y trae objetivo, diseño/muestra, instrumentos, resultados con cifras y conclusión.
- [ ] Cada variable tiene al menos 3 definiciones de autores distintos y una definición propia de síntesis.
- [ ] Toda dimensión e indicador de `tesis.yaml` tiene definición citada en 2.2, y las fórmulas coinciden con las del YAML.
- [ ] Hay entre 10 y 20 términos básicos, en orden alfabético y citados.
- [ ] Todas las claves `\textcite` y `\parencite` existen en `bib/referencias.bib`, y ninguna referencia fue inventada.
- [ ] Se cumple APA en español: "y" en lugar de "&", "et al." correcto y sin iniciales en las citas.
- [ ] No hay párrafos con alta coincidencia contra `literatura/pdfs/` (lo verifica `tesis-jurado`).
- [ ] El tiempo verbal es el correcto y el texto está en tercera persona.
