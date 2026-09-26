# APA 7 en español

Fuente: Manual de Normas APA 7.ª edición (Pontificia Universidad Javeriana, 2020) usado
en el curso, adaptado al formato UNTELS (el formato de página es el de UNTELS, no el
del manual APA: ver `formato-untels.md`). En LaTeX, biblatex con `style=apa` y
`\DeclareLanguageMapping{spanish}{spanish-apa}` resuelve casi todo; esta hoja es para
redactar y revisar.

## Citas en el texto

| Caso | Narrativa (énfasis en el autor) | Parentética (énfasis en la idea) | LaTeX |
|---|---|---|---|
| 1 autor | Quintero (2020) | (Quintero, 2020) | `\textcite{k}` / `\parencite{k}` |
| 2 autores | Rodríguez y Sánchez (2013) | (Rodríguez y Sánchez, 2013) | igual |
| 3 o más | Barton et al. (2016) — desde la primera cita | (Barton et al., 2016) | igual |
| Corporativo, 1.ª vez | Organización Mundial de la Salud (OMS, 2015) | (Organización Mundial de la Salud [OMS], 2015) | `shortauthor` en el .bib |
| Corporativo, después | OMS (2015) | (OMS, 2015) | automático |
| Varias obras | — | (Cardozo, 2020; Chocarro y Garaigordobil, 2019) — orden alfabético | `\parencite{a,b}` |
| Mismo autor y año | — | (López, 2019a, 2019b) | automático |
| Sin fecha | Pulido (s.f.) | (Pulido, s.f.) | |
| Cita de cita (evitar) | Penrose (como se citó en Hawking, 2010) | | solo Hawking va en referencias |

- En español se usa **"y"**, nunca "&", dentro y fuera del paréntesis.
- **"et al."** sin punto después de "et". Nunca "et. al.".
- En la cita solo va el apellido; **nunca iniciales** ni el título de la obra.

## Citas textuales

- **Menos de 40 palabras:** entre comillas dobles, con página.
  `Según \textcite[p.~111]{kaplan2019}, "…".` o `"…" \parencite[p.~111]{kaplan2019}.`
- **40 palabras o más:** bloque sangrado 1,27 cm, sin comillas, el punto va antes del
  paréntesis: `… momentos. (p. 111)`. En LaTeX: entorno `quote` + `\parencite[p.~111]{k}`
  al final.
- Rango de páginas: "pp. 23-24". Sin paginación: "párr. 4".
- **Preferir la paráfrasis**: reformular la idea con palabras y estructura propias
  integradas al argumento, con cita (sin página, aunque APA recomienda incluirla en
  paráfrasis de pasajes concretos). Cambiar sinónimos no es parafrasear.
- Las citas textuales entre comillas las excluye el filtro de Turnitin; aun así, no
  abusar: un capítulo de citas textuales no demuestra dominio.

## Lista de referencias

- Título `REFERENCIAS BIBLIOGRÁFICAS`, sangría francesa, orden alfabético, sin numerar.
- Solo lo citado, y todo lo citado.
- Hasta 20 autores se listan todos. El último se une con "y" (sin coma) en español; en
  referencias de obras en inglés APA usa ", &", pero en un documento en español
  biblatex-apa usa "y" de forma uniforme: aceptable y consistente.
- DOI como `https://doi.org/xxxx`, sin "DOI:" ni "Recuperado de".
- En títulos en español: mayúscula solo inicial y nombres propios.
- Sin lugar de publicación para libros.

### Formatos

**Artículo de revista**

```
Apellido, A. A., Apellido, B. B. y Apellido, C. C. (Año). Título del artículo.
    Nombre de la Revista, volumen(número), pp–pp. https://doi.org/xxx
```

Nombre de la revista y volumen en cursiva. Ejemplo:
Lin, J.-W., Chao, C.-T. y Chiou, J.-S. (2018). Determining neuronal number in each
hidden layer… *IEEE Access*, *6*, 52582–52597. https://doi.org/10.1109/ACCESS.2018.2870189

**Libro**

```
Apellido, A. A. (Año). Título en cursiva (2.ª ed.). Editorial. https://doi.org/xxx
```

**Capítulo de libro**

```
Apellido, A. (Año). Título del capítulo. En B. Apellido (Ed.), Título del libro (pp. 109–139). Editorial.
```

**Tesis**

```
Apellido, A. (Año). Título de la tesis [Tesis de pregrado, Nombre de la institución].
    Repositorio institucional. URL
```

**Artículo de congreso (IEEE, ACM)**

```
Apellido, A. (Año). Título. En Nombre de las actas (pp. x–y). Editorial. https://doi.org/xxx
```

**Página web / documentación técnica**

```
Organización. (Año, día de mes). Título de la página. Nombre del sitio. URL
```

Ejemplo: Meta. (2026). *WhatsApp Cloud API overview*. Meta for Developers. URL. Si no
hay fecha: (s.f.). Si el contenido cambia, añadir "Recuperado el día de mes de año, de URL".

**Informe institucional o de gobierno**

```
Organización. (Año). Título del informe (N.º xx). URL
```

INEI, OSIPTEL, MTC, IGP, etc.

**Ley**

```
Ley N.º 29733. (2011, 21 de junio). Ley de Protección de Datos Personales. Diario Oficial El Peruano.
```

**Software**

```
OpenAI. (2026). OpenAI API (versión del modelo) [Software]. https://platform.openai.com
```

## Tablas y figuras

Ver `formato-untels.md`: "Tabla N" en negrita, título en cursiva debajo, solo líneas
horizontales, `Nota.` en cursiva debajo, numeración continua, mención en el texto antes
de que aparezca. Si la figura o tabla viene de otra fuente: "Nota. Tomado de Autor
(año)" o "Adaptado de…", y la fuente va en referencias.

## Números

- Decimales con coma en el texto en español (0,05; 13,4 %), según RAE. Se acepta el
  punto si el asesor lo prefiere; ser consistente en todo el documento.
- Valores p y correlaciones sin cero inicial en APA (p = ,032 con coma decimal;
  p = .032 con punto).
- Porcentajes con espacio: 15 %.
