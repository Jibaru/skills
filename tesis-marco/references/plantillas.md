# Plantillas del Capítulo II

## Párrafo de antecedente (LaTeX)

```latex
\textcite{garcia2024} desarrollaron, en una empresa de retail de Bogotá, Colombia, una
investigación orientada a determinar el efecto de un asistente conversacional basado en
modelos de lenguaje sobre el tiempo de atención de consultas por WhatsApp. El estudio,
de diseño pre-experimental, trabajó con una muestra de 384 conversaciones registradas
antes y después de la implementación, y empleó una ficha de registro extraída de los
registros del sistema. Los resultados evidenciaron que el tiempo promedio de primera
respuesta descendió de 14,2 a 0,8 minutos y que el 71~\% de las consultas se resolvió
sin derivación a un agente humano ($p < 0{,}001$). Los autores concluyeron que la
integración de un modelo de lenguaje con la API de WhatsApp reduce significativamente
los tiempos de atención, aunque advirtieron la necesidad de supervisión humana en
consultas complejas.
```

Ejemplo ilustrativo; los datos deben venir de una ficha real.

Variaciones de apertura para no repetir la misma plantilla en cada párrafo (Turnitin
marca frases idénticas repetidas):

- "\textcite{x} llevaron a cabo…", "En el estudio de \textcite{x}, realizado en…",
  "Con el propósito de…, \textcite{x}…", "\textcite{x}, en su tesis para optar el
  título profesional de Ingeniero de Sistemas en la Universidad…, se plantearon…".

Variaciones de cierre: "concluyeron que…", "lo que les permitió afirmar que…",
"determinaron que…", "de lo cual se desprende que…".

## Tesis como antecedente

Mencionar tipo y universidad: "\textcite{x}, en su tesis de maestría presentada en la
Universidad Nacional Mayor de San Marcos, …". La referencia APA va como `@thesis` (la
arma `tesis-referencias`).

## Síntesis de subsección (obligatoria)

```latex
Los antecedentes revisados coinciden en medir el efecto de los asistentes
conversacionales mediante el tiempo de respuesta y la tasa de resolución sin
intervención humana \parencite{a2023,b2024,c2025}; sin embargo, ninguno se desarrolló
en micro y pequeñas empresas del sur de Lima, lo que justifica la presente
investigación.
```

## Variable con tres definiciones

```latex
\subsection{Atención de consultas de clientes}
Para \textcite{autorA2022}, la atención de consultas … . En una línea similar,
\textcite{autorB2023} la conciben como … , mientras que \textcite{autorC2024} enfatizan
… . Para efectos de la presente investigación, se entiende por atención de consultas
de clientes el proceso mediante el cual … , el cual se mide a través de su oportunidad
y su resolutividad.
```

## Indicador con fórmula

```latex
\paragraph{Tiempo promedio de primera respuesta (TPR).} Representa el lapso medio
transcurrido entre la recepción de un mensaje del cliente y el primer mensaje de
respuesta \parencite{autorB2023}. Se calcula mediante:
\begin{equation}
  TPR = \frac{\sum_{i=1}^{n} (t_{r,i} - t_{m,i})}{n}
\end{equation}
Donde:
\begin{itemize}
  \item $t_{m,i}$: instante de recepción del mensaje $i$.
  \item $t_{r,i}$: instante de la primera respuesta al mensaje $i$.
  \item $n$: número de conversaciones observadas.
\end{itemize}
```

## Término básico

```latex
\textbf{Webhook.} Mecanismo por el cual una aplicación notifica a otra, mediante una
petición HTTP, la ocurrencia de un evento en tiempo real \parencite{clave}.
```
