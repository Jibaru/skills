# Catálogo de indicadores: atención por mensajería con IA

Son puntos de partida para el grilling. **Ninguno entra a la tesis sin un antecedente o
autor que lo respalde** (búscalo en `literatura/fichas/`) ni sin una fuente real de
datos confirmada con la persona.

| Dimensión (ejemplo) | Indicador | Fórmula | Unidad | Escala | Sentido | Fuente del dato |
|---|---|---|---|---|---|---|
| Oportunidad | Tiempo promedio de primera respuesta (TPR) | $\frac{\sum (t_{r,i}-t_{m,i})}{n}$ | min | Razón | baja | timestamps de mensajes (webhook / BD) |
| Oportunidad | Tiempo promedio de resolución (TRC) | $\frac{\sum (t_{cierre,i}-t_{inicio,i})}{n}$ | min | Razón | baja | BD de conversaciones |
| Oportunidad | Porcentaje de consultas atendidas fuera de horario | $\frac{C_{fh}}{C_{total}}\times100$ | % | Razón | sube | BD |
| Resolutividad | Tasa de resolución sin intervención humana (TRA) | $\frac{C_{auto}}{C_{total}}\times100$ | % | Razón | sube | BD (flag de derivación) |
| Resolutividad | Tasa de derivación a agente | $\frac{C_{deriv}}{C_{total}}\times100$ | % | Razón | baja | BD |
| Resolutividad | Consultas atendidas por día | $\frac{C_{total}}{d}$ | consultas/día | Razón | sube | BD |
| Calidad de respuesta | Precisión de respuestas (muestra evaluada) | $\frac{R_{correctas}}{R_{evaluadas}}\times100$ | % | Razón | sube | ficha de evaluación por expertos |
| Calidad de respuesta | Tasa de consultas abandonadas | $\frac{C_{aband}}{C_{total}}\times100$ | % | Razón | baja | BD |
| Satisfacción | Nivel de satisfacción del cliente | promedio Likert 1–5 | puntos | Ordinal* | sube | cuestionario (post) |
| Costo | Costo por consulta atendida | $\frac{Costo_{periodo}}{C_{total}}$ | S/ / consulta | Razón | baja | planilla + facturación API |

\*Likert tratado como ordinal. Si se usa una prueba paramétrica sobre el promedio de
ítems, hay que justificarlo en metodología.

## Advertencias para el pre/post

- **Pre-prueba sin sistema**: los indicadores de la BD del sistema no existen antes de
  implementarlo. O1 sale de registros previos de la empresa (historial de WhatsApp
  Business, hojas de cálculo, cuaderno de atención) o de una medición manual
  previa. Confirma que ese dato existe **antes** de fijar el indicador.
- **Satisfacción**: normalmente solo post. Si es el único indicador de una hipótesis,
  esa hipótesis no puede contrastarse pre/post; conviene cambiar el indicador o
  medir la satisfacción también en O1 con el proceso manual.
- **Unidad de análisis coherente**: si el indicador es por conversación, la muestra
  son conversaciones (no días ni clientes). Esto lo usa `tesis-metodologia`.
