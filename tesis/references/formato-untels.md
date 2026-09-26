# Formato UNTELS

Fuentes: formatos del plan de tesis y tesis UNTELS (2023), RP N.° 064-2019-UNTELS,
RCU N.° 009-2024-UNTELS (reglamento de grados y títulos vigente) y tesis de Ingeniería
de Sistemas aprobadas. `untels.cls` ya implementa todo esto; este archivo es para
revisar y para decidir cuando algo no está claro.

## Página y texto

| Elemento | Valor | Nota |
|---|---|---|
| Papel | A4 | |
| Márgenes | izquierdo 3 cm; derecho, superior e inferior 2,5 cm | |
| Fuente | Times New Roman 12 pt (también en tablas; 11 pt aceptable en tablas grandes) | |
| Interlineado | 1,5 | La norma dice 1,5. Las tesis aprobadas usan doble (APA). Parámetro `meta.interlineado` |
| Alineación | justificado | Parámetro `meta.alineacion` |
| Sangría | 1,27 cm en la primera línea de cada párrafo ("5.° espacio") | |
| Espacio entre párrafos | 0 | |
| Capítulos | cada uno en página nueva | |

## Numeración de páginas

- Centro inferior.
- Carátula: cuenta pero no muestra número.
- Preliminares (dedicatoria, agradecimientos, resumen, abstract, índices): romanos
  en minúscula (i, ii, iii…).
- Desde la Introducción: arábigos.
- En el plan de tesis todo va en arábigos desde el índice.

## Títulos

| Nivel | Forma | Ejemplo |
|---|---|---|
| Capítulo | romano + punto, MAYÚSCULAS, negrita, centrado, sin la palabra "Capítulo" | `I. PLANTEAMIENTO DEL PROBLEMA` |
| Sección | número arábigo, negrita, al margen | `1.1 Descripción del problema` |
| Subsección | negrita, sangrada 1,27 cm | `1.4.1 Delimitación espacial` |
| Sin número | MAYÚSCULAS, negrita, centrado | `INTRODUCCIÓN`, `RESUMEN`, `ANEXOS` |

La numeración de secciones sigue al capítulo: el capítulo II usa 2.1, 2.2; nunca
reinicia en 1.1 (error real de un avance anterior).

## Tablas y figuras (APA 7)

```
Tabla 3                               ← negrita, a la izquierda
Indicadores de la variable dependiente ← cursiva, estilo oración, línea siguiente
───────────────────────────────────
 Indicador   Fórmula    Unidad         ← solo líneas horizontales
───────────────────────────────────
 ...
───────────────────────────────────
Nota. Elaboración propia.             ← "Nota." en cursiva
```

- Numeración arábiga continua en todo el documento, no por capítulo.
- Toda tabla y figura se menciona en el texto antes de aparecer ("como se observa en la Tabla 3").
- Nota obligatoria: `Nota. Elaboración propia.` / `Nota. Tomado de Autor (año).` /
  `Nota. Adaptado de Autor (año, p. x).` Nunca "Fuente:".
- Una tabla es "Tabla", aunque sea grande (la operacionalización y la matriz de
  consistencia son tablas). Nunca pegar tablas como imagen.
- En LaTeX: `\caption{...}` arriba, `\nota{...}` debajo; booktabs, sin líneas verticales.

## Carátula

Dos formatos. `meta.caratula` elige cuál.

**`facultad`** (por defecto; la que usan los planes y tesis de Sistemas): centrado,
Times 14 pt.

```
UNIVERSIDAD NACIONAL TECNOLÓGICA DE LIMA SUR          (negrita)
FACULTAD DE INGENIERÍA Y GESTIÓN                      (negrita)
CARRERA PROFESIONAL                                   (negrita)
INGENIERÍA DE SISTEMAS
[escudo UNTELS]
PLAN DE TESIS | TESIS                                 (negrita)
"TÍTULO EN MAYÚSCULAS ENTRE COMILLAS"
PARA OPTAR EL TÍTULO PROFESIONAL DE                   (negrita)
INGENIERO DE SISTEMAS
PRESENTADO POR:                                       (negrita)
BACHILLER: APELLIDOS, NOMBRES
ASESOR: GRADO APELLIDOS, NOMBRES
Villa El Salvador, AÑO
PERÚ
```

**`reglamento`** (Anexo N.° 03 del RCU 009-2024; la que va al repositorio con el
CD): incluye ESCUELA PROFESIONAL DE INGENIERÍA DE SISTEMAS, "Para optar el Título
Profesional de", "PRESENTADO POR EL BACHILLER", ORCID del autor y del asesor, y cierra
con "Villa El Salvador" y el año.

La rúbrica pide el ORCID del asesor: tenlo en `tesis.yaml` aunque uses la carátula de
facultad.

## Referencias

- APA 7, orden alfabético, sin numerar, sangría francesa de 1,27 cm.
- Título del capítulo: `REFERENCIAS BIBLIOGRÁFICAS`.
- Detalle de citas y referencias en español: `apa7-es.md`.

## Entrega final (RCU 009-2024, art. 20.9)

- 4 ejemplares empastados (azul, letras doradas).
- CD con PDF que contiene: reporte de similitud, autorización de repositorio (Anexo
  04), carátula (Anexo 03), acta (Anexo 05) y el trabajo completo.
- Norma APA edición vigente o IEEE. Esta skill usa APA 7.
