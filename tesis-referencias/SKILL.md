---
name: tesis-referencias
description: Gestiona las referencias de la tesis UNTELS en APA 7 en español con biblatex-apa. Crea entradas verificadas desde DOI (Crossref/DataCite), ISBN (Open Library), tesis de repositorios y páginas web; nunca inventa referencias; cruza las citas de los .tex con el .bib y valida DOIs y reglas APA. Úsala cuando el usuario diga "agrega esta referencia", "cita este paper", "genera las referencias", "revisa las citas", "formato APA", "bibliografía", "referencias bibliográficas", "¿está bien citado?", o después de tesis-literatura para pasar las fichas al .bib.
metadata:
  author: Jibaru
  version: 1.0.0
---

# tesis-referencias

Una sola regla por encima de todas: **ninguna referencia se escribe de memoria**. Cada entrada del `.bib` sale de una de tres fuentes:
- un registro verificable: DOI en Crossref o DataCite, ISBN en Open Library;
- la ficha de un documento que está en `literatura/pdfs/`;
- los datos que el usuario copió de la página oficial.

Si no se puede verificar, no entra, y se le dice al usuario qué falta.

El formato de citas y referencias está en `../tesis/references/apa7-es.md`. El script es `scripts/bib.py` y trabaja sobre `bib/referencias.bib` del proyecto. Pásale `--proyecto P` y exporta `TESIS_MAILTO`.

## Comandos

| Necesidad | Comando |
|---|---|
| Artículo, conferencia, capítulo o preprint con DOI | `python scripts/bib.py doi 10.3390/s22176482 [otro DOI...]` |
| Libro | `python scripts/bib.py isbn 9780262035613` (luego revisa autor, año y edición contra la portada) |
| Tesis de repositorio sin DOI | `python scripts/bib.py tesis --autor "García Mosco, Melissa and Zapata Martínez, Cristian David" --anio 2025 --titulo "..." --universidad "Universidad César Vallejo" --grado pregrado --url https://hdl.handle.net/...` |
| Página web o informe institucional | `python scripts/bib.py web --autor "Instituto Geofísico del Perú" --anio 2023 --titulo "..." --sitio "IGP" --url https://...` (sin coma equivale a autor corporativo) |
| Todo lo analizado en la revisión | `python scripts/bib.py desde-fichas` (escribe `bibkey` en cada ficha) |
| Auditoría antes de compilar o entregar | `python scripts/bib.py check` |

`doi` comprueba primero en doi.org que el DOI existe. Si no existe, falla y no escribe nada. Además:

- Si el mismo DOI o título ya está en el `.bib`, reutiliza la clave existente.
- Genera claves del tipo `apellidoAAAApalabra`, por ejemplo `bilal2022early`.
- Pone `langid` para que biblatex-apa aplique las reglas de mayúsculas del idioma de la obra.
- Protege siglas y marcas en títulos en inglés (`{IEEE}`, `{WhatsApp}`, `{ChatGPT}`) para que no se pasen a minúscula.

Los nombres propios comunes, como "Peru" o "Taiwan", no se detectan solos. Revisa los títulos en inglés y protégelos a mano: `{Peru}`.

## `check`: qué valida

`check` devuelve el código de salida 1 si encuentra errores. Pásalo siempre antes de compilar para entregar.

| Nivel | Regla |
|---|---|
| ERROR | clave citada en `capitulos/`, `anexos/`, `generado/` o `main.tex` que no existe en el `.bib` |
| ERROR | DOI que no existe en doi.org (señal de referencia inventada) |
| ERROR | `et al.` dentro de `author`: hay que poner todos los autores (hasta 20); biblatex-apa abrevia solo |
| ERROR | falta la fecha, el título o `journaltitle` de un artículo |
| AVISO | entrada del `.bib` que nadie cita (en APA solo va lo citado) |
| AVISO | autor corporativo sin llaves (`{Instituto Geofísico del Perú}`) |
| AVISO | título en español con Mayúsculas Iniciales (APA en español usa tipo oración) |
| AVISO | sin DOI ni URL; URL que repite el DOI; sin `langid` |

Las verificaciones de DOI se guardan en `bib/.doi-verificados.json`.

## Cómo citar en el texto

biblatex con `style=apa` y `\DeclareLanguageMapping{spanish}{spanish-apa}` (la plantilla ya lo trae). Con eso aparece "y" entre dos autores, "et al." desde la primera cita cuando hay 3 o más, y "s.f." cuando no hay fecha.

| Situación | Comando | Resultado |
|---|---|---|
| Narrativa (énfasis en el autor): antecedentes | `\textcite{bilal2022early}` | Bilal et al. (2022) |
| Parentética (énfasis en el contenido): bases teóricas | `\parencite{bilal2022early}` | (Bilal et al., 2022) |
| Varias obras | `\parencite{lin2018determining,bilal2022early}` | (Bilal et al., 2022; Lin et al., 2018) |
| Textual corta (< 40 palabras) | `"..." \parencite[p.~11]{bilal2022early}` | "…" (Bilal et al., 2022, p. 11) |
| Textual larga (≥ 40 palabras) | `\begin{quote}...\end{quote}` y `\parencite[p.~14]{...}` al final, después del punto | bloque sangrado sin comillas |
| Cita de cita (evitarla) | `Penrose (como se citó en \textcite{hawking2010})` | solo la obra leída va al `.bib` |
| Autor corporativo con sigla | primera vez `\textcite{igp2023}` + "(IGP)"; luego "IGP (2023)" | APA 7 |

Reglas de uso:

- **La paráfrasis va primero.** La cita textual se reserva para definiciones clave o frases que no se pueden reformular. En los antecedentes, la paráfrasis va sin número de página. Parafrasear es reescribir la idea con estructura propia, no cambiar palabras por sinónimos (ver `../tesis/references/jurado.md`, originalidad).
- Toda cita textual lleva página. Toma la página de la sección `## Citas textuales` de la ficha, no la supongas.
- Nunca escribas la cita a mano, como "(Bilal et al., 2022)" en texto plano. Siempre usa el comando, porque así `check` puede auditarla.
- No cites fuentes que no se leyeron. Si un dato viene de una tesis que cita a otro autor, busca la fuente original. Si no está disponible, usa la cita de cita.
- Los títulos de obras dentro del texto van en cursiva, sin comillas simples.

## Integración

- `tesis-literatura` → `desde-fichas` al cerrar la revisión.
- `tesis-problema`, `tesis-marco` y `tesis-metodologia` añaden referencias con `doi`, `isbn`, `tesis` o `web` a medida que redactan, y citan solo claves que ya existen.
- `tesis-jurado` ejecuta `check` como parte de su revisión, y el criterio 15 de la rúbrica depende de él.
- Para compilar, la plantilla usa `biber`. Si biber avisa de campos o autores mal formados, corrige la entrada con este script o a mano, nunca borrando la cita.
