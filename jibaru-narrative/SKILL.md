---
name: jibaru-narrative
description: Define cómo escribir posts largos para Ignacio/Crafter Station cuando el objetivo es contar cómo se construye algo, explicar un workflow, documentar una experiencia o compartir una forma de trabajar. La prioridad no es sonar profesional, corporativo, inspiracional ni "perfectamente escrito". La prioridad es que el texto parezca una explicación extensa de Ignacio: alguien que está contando cómo hace las cosas, por qué las hace así, qué decisiones toma y qué ocurre después. El texto debe sentirse como una historia explicada de principio a fin, no como una documentación técnica, una lista de pasos, una presentación de diapositivas ni un artículo genérico sobre tecnología.
---

## Regla principal

**Escribe como si Ignacio estuviera contando la historia en voz alta, pero ordenada para que otra persona pueda seguirla.**

La narración debe avanzar de manera natural:

> situación → contexto → decisión → explicación → ejemplo → consecuencia → siguiente decisión → resultado

No debe avanzar así:

> título → bullet → bullet → bullet → conclusión.

Tampoco debe sonar como:

> "Primero haces X. Luego haces Y. Finalmente haces Z."

Salvo cuando realmente sea necesario explicar una secuencia concreta.

---

# 1. Voz y ritmo

## 1.1. Frases largas y conectadas

Ignacio suele explicar una idea desarrollándola dentro de la misma frase o párrafo. No hay que cortar cada idea en una oración independiente solo para hacer el texto más "dinámico".

### Incorrecto

> Primero tengo una idea.
>
> Después uso GrillMe.
>
> Luego uso Claude Code.
>
> Después hago el deployment.

### Correcto

> Normalmente todo empieza con una idea que tengo más o menos en la cabeza, y dependiendo de qué tan grande sea el proyecto empiezo a aterrizarla un poco más. Para eso utilizo GrillMe, que me sirve justamente para ir conversando sobre lo que quiero hacer y terminar definiendo los requerimientos que necesito antes de empezar a escribir código, porque si es algo pequeño tampoco tiene sentido que me ponga a hacer una especificación enorme, pero si ya es un proyecto que tiene varias partes prefiero dedicarle un poco más de tiempo a esa parte para que Claude Code tenga claro qué es lo que quiero construir.

La segunda versión debe ser el modelo.

## 1.2. El párrafo debe desarrollar una idea

Un párrafo normalmente debe tener suficiente espacio para explicar:

- qué está pasando;
- por qué se hace;
- cómo funciona;
- qué excepción o matiz existe;
- y cómo conecta con lo siguiente.

No crear un párrafo nuevo después de cada oración.

Como regla práctica, evitar párrafos de una o dos frases salvo que exista una razón narrativa clara para crear una pausa.

## 1.3. Usar conectores naturales

Preferir conectores que aparezcan naturalmente en una explicación hablada:

- "entonces"
- "por eso"
- "porque"
- "además"
- "dependiendo de"
- "por ejemplo"
- "en ese caso"
- "a partir de ahí"
- "una vez que"
- "después"
- "al final"
- "esto también"
- "lo mismo ocurre"
- "por ahora"
- "cuando"
- "si"
- "y aquí"
- "de hecho"

No abusar de ellos ni convertirlos en muletillas artificiales. Deben servir para conectar ideas.

## 1.4. No intentar sonar demasiado literario

No agregar metáforas o frases grandilocuentes que Ignacio no haya utilizado.

Evitar expresiones como:

- "un botón mágico"
- "la magia detrás de..."
- "una máquina perfectamente aceitada"
- "llevar tu productividad al siguiente nivel"
- "revolucionar la forma en que construimos"
- "el futuro del desarrollo"
- "una nueva era"
- "orquestar un ecosistema"
- "convertir ideas en realidad con un solo comando"

Aunque puedan sonar bien, no representan esta voz.

## 1.5. No inventar filosofía

No convertir una explicación técnica en un manifiesto.

Si Ignacio dijo que automatiza trabajo repetitivo, decir eso.

No transformarlo en:

> "La filosofía detrás de todo esto es devolverle al desarrollador su tiempo para que pueda concentrarse en lo verdaderamente importante."

Eso puede ser una interpretación, pero no debe introducirse como si fuera su forma de hablar.

---

# 2. El post debe sentirse como una historia

La estructura base recomendada es:

1. **Situación inicial:** qué está haciendo Ignacio actualmente y por qué surgió la necesidad.
2. **El problema cotidiano:** qué cosas se empezaron a repetir.
3. **Primera decisión:** qué empezó a hacer para resolverlo.
4. **Desarrollo del workflow:** explicar las herramientas una por una dentro de la historia.
5. **Ejemplos:** mostrar cómo se aplican en un proyecto real.
6. **Iteración:** explicar qué ocurre cuando algo falla.
7. **Validación humana:** explicar qué sigue haciendo Ignacio personalmente.
8. **Resultado:** cómo termina el proyecto y qué queda preparado para el siguiente.
9. **Cierre:** reflexión práctica sobre cómo el workflow fue creciendo con el tiempo.

No presentar esta estructura como una lista visible en el post. Es una estructura interna para ordenar la narración.

---

# 3. Cómo empezar

El comienzo debe ser contextual, no una conclusión.

Una apertura adecuada puede explicar algo que Ignacio está haciendo actualmente:

> "Últimamente mi forma de crear aplicaciones en Crafter Station ha ido cambiando bastante, sobre todo porque cada vez que hago un proyecto nuevo me doy cuenta de que hay muchas cosas que termino haciendo de la misma manera."

Después se explica el problema lentamente.

La introducción debe responder progresivamente:

- ¿Qué está haciendo?
- ¿Qué empezó a notar?
- ¿Qué cosas se repetían?
- ¿Por qué decidió automatizarlas?
- ¿Qué sigue haciendo él?

No comenzar con una conclusión tipo:

> "Así es como construyo aplicaciones 10 veces más rápido."

Tampoco comenzar con una lista de herramientas.

---

# 4. Explicar cada herramienta dentro del contexto

No hacer una sección que sea simplemente:

> "Herramientas que utilizo: Claude Code, Dokploy, Spaceship, GitHub..."

En lugar de eso, cada herramienta debe aparecer cuando la historia llega naturalmente a la necesidad que resuelve.

### Patrón recomendado

> necesidad → problema → herramienta → cómo la utiliza → ejemplo → por qué existe → siguiente parte

Por ejemplo:

> "Después está la parte del deployment. Yo normalmente parto de un VPS de Contabo donde tengo Dokploy instalado..."

Después de presentar Dokploy, explicar por qué existe el VPS CLI:

> "Pero yo no quiero estar entrando todo el tiempo al dashboard para hacer estas cosas manualmente. Entonces hice un CLI..."

Ese "pero yo no quiero... entonces hice..." es mucho más fiel al estilo que una explicación tipo documentación.

---

# 5. Explicar el porqué, no solo el qué

Cada herramienta o decisión importante debe responder, cuando corresponda:

- ¿Qué es?
- ¿Por qué la utiliza?
- ¿Qué problema resuelve?
- ¿Cómo encaja con el resto?
- ¿Qué hace realmente el agente con ella?
- ¿Cuándo no la utiliza?

No convertir cada herramienta en una ficha técnica.

### Ejemplo

En vez de:

> "VPS CLI permite crear proyectos, aplicaciones, bases de datos, dominios y deployments."

Preferir:

> "Yo no quería estar entrando constantemente al dashboard de Dokploy para crear cada recurso, así que hice un CLI que utiliza la API de Dokploy. Con ese CLI puedo crear proyectos, aplicaciones, bases de datos, dominios, hacer deployments, revisar logs y configurar variables de entorno, y eso permite que Claude Code pueda hacer muchas de estas operaciones desde el mismo flujo en el que está implementando la aplicación."

---

# 6. Mantener los matices y las excepciones

Una característica importante de esta forma de escribir es que no presenta las decisiones como reglas absolutas.

Usar expresiones como:

- "depende del proyecto"
- "no siempre"
- "por ahora"
- "cuando hace falta"
- "si el proyecto lo necesita"
- "para una aplicación pequeña"
- "cuando empieza a crecer"
- "no necesariamente"
- "en ese caso"

Por ejemplo, no decir:

> "Todos los proyectos deben utilizar una arquitectura modular."

Sino:

> "No tengo una arquitectura única que utilice para absolutamente todo. Si estoy haciendo una aplicación pequeña, probablemente tenga Next.js, PostgreSQL y Drizzle, y con eso puede ser suficiente. Cuando el proyecto realmente empieza a tener más cosas, ahí sí cambia la forma en que lo organizo."

Esto refleja decisiones prácticas, no dogmas.

---

# 7. No sobrearquitecturar la narrativa

La misma filosofía del código aplica a la escritura.

Si una idea puede explicarse naturalmente en un párrafo, no crear cinco subsecciones.

Evitar demasiados headings.

Para un post largo, normalmente bastan entre 5 y 9 secciones principales, aunque algunas pueden desaparecer si no son necesarias.

Los headings deben marcar cambios reales de tema, por ejemplo:

- La idea
- La planificación
- El VPS y el deployment
- Trabajar por fases
- Cómo pruebo cada fase
- Qué ocurre cuando algo falla
- La IA dentro de los proyectos
- Las herramientas que fui creando
- Cómo termina el proceso

No crear headings para cosas diminutas como:

- "GitHub"
- "Docker"
- "Logs"
- "DNS"

si esas cosas pueden explicarse naturalmente dentro de una sección más grande.

---

# 8. La primera persona es importante

Utilizar primera persona porque el post cuenta una experiencia personal.

Preferir:

- "yo utilizo"
- "yo normalmente"
- "me di cuenta"
- "prefiero"
- "me gusta"
- "intenté"
- "terminé creando"
- "cuando necesito"
- "si el proyecto tiene"
- "por ahora"

Evitar convertir la experiencia personal en una receta universal:

> "Debes usar..."
> "La mejor arquitectura es..."
> "Todo desarrollador debería..."

El texto debe decir cómo trabaja Ignacio, no cómo debe trabajar todo el mundo.

---

# 9. Mostrar evolución, no fingir que todo fue diseñado desde el principio

Cuando se habla de herramientas propias, explicar que muchas surgieron porque algo se repetía.

Este patrón es especialmente importante:

> "Esto no existía desde el principio. Lo fui creando porque me encontré varias veces con el mismo problema."

Por ejemplo:

> "El VPS CLI salió de querer administrar el VPS sin tener que hacer todo manualmente desde el dashboard. El CLI de Spaceship salió de querer automatizar los dominios. UploadX salió de que no quería tener que configurar una instancia nueva de MinIO para cada proyecto..."

Esto hace que la historia se sienta real y progresiva.

No decir que todo forma parte de una gran arquitectura diseñada desde el principio si no fue así.

---

# 10. El agente no debe convertirse en protagonista absoluto

Claude Code es una parte importante del workflow, pero el post debe mantener claro que Ignacio sigue tomando decisiones.

Explicar la división de trabajo de manera narrativa:

- Ignacio define qué quiere construir.
- Ignacio define requerimientos importantes.
- Ignacio toma decisiones de producto y arquitectura cuando corresponde.
- Claude Code implementa.
- Claude Code ejecuta comandos y utiliza herramientas.
- Claude Code puede hacer pruebas y deployments.
- Ignacio prueba la aplicación como usuario.
- Ignacio decide si el resultado realmente está bien.

No presentar al agente como autónomo en el sentido de que "hace todo" sin supervisión.

---

# 11. La validación manual debe tener espacio

No reducir la parte de testing a "ejecuto tests".

En esta narrativa, una parte importante es que Ignacio abre la aplicación y la utiliza como usuario.

Explicar que revisa:

- flujo;
- funcionalidad;
- comportamiento;
- diseño;
- errores;
- experiencia general.

Y que no necesariamente revisa cada línea de código.

La idea importante es:

> "Una fase no termina simplemente porque Claude Code terminó de implementar algo. Para considerar una fase terminada tengo que haberla probado yo mismo y estar conforme tanto con el funcionamiento como con el diseño."

No convertir esto en una checklist seca; explicarlo dentro de la historia.

---

# 12. Los errores deben contarse como parte normal del proceso

Cuando se explica qué pasa si algo falla, no dramatizar.

No decir:

> "Cuando ocurre un desastre en producción..."

Simplemente contar el proceso:

> "Si encuentro un error, le paso el error. Si hay logs, le paso los logs. Si existe un trace ID, también se lo paso..."

Después explicar que el agente investiga, cambia, prueba y vuelve a desplegar.

Esto ayuda a mostrar que el workflow es iterativo.

---

# 13. Usar ejemplos concretos, pero no inventar casos

Los ejemplos deben venir de información real proporcionada por Ignacio.

Ejemplos válidos dentro de su contexto:

- una aplicación Next.js con PostgreSQL;
- un proyecto que utiliza Clerk;
- una aplicación que necesita archivos y utiliza UploadX;
- un proyecto con Docker Compose;
- una API;
- un worker;
- WAPI;
- un CLI;
- un proyecto con IA;
- una aplicación con PostgreSQL y Redis.

No inventar métricas, usuarios, tiempos, resultados o problemas que Ignacio no haya mencionado.

Si el ejemplo no necesita nombre, mantenerlo genérico.

---

# 14. Tecnología: precisión sin convertir el texto en documentación

Se pueden mencionar tecnologías concretas porque forman parte de la historia:

- Claude Code
- GrillMe
- Dokploy
- Contabo
- VPS CLI
- Spaceship CLI
- GitHub CLI (`gh`)
- GitHub Actions
- Docker
- Docker Compose
- Next.js
- PostgreSQL
- Redis
- Drizzle
- Clerk
- UploadX
- AI SDK
- OpenAI

Pero las tecnologías deben aparecer como parte de lo que Ignacio está haciendo.

No crear listas de tecnologías salvo que el usuario las pida explícitamente.

---

# 15. Enlaces

Cuando el post se vaya a publicar como HTML, los nombres de herramientas y proyectos deben ser enlaces cuando exista un URL conocido.

Enlazar directamente la palabra o nombre dentro del párrafo.

Ejemplo:

> "Para esa parte utilizo [GrillMe], que me sirve..."

No hacer una sección al final llamada "Links" salvo que el usuario la pida.

URLs conocidas del ecosistema de Crafter:

- GrillMe: https://www.aihero.dev/skills-grill-me
- VPS CLI: https://github.com/crafter-station/vps-cli
- Spaceship CLI: https://github.com/crafter-station/spaceship-cli
- UploadX: https://uploadx.crafter.run/
- Crafter Station: http://crafter.run/
- WAPI: http://wapi.crafter.run/

URLs oficiales que pueden utilizarse cuando se mencionen las herramientas correspondientes:

- Claude Code: https://code.claude.com/
- GitHub: https://github.com/
- GitHub CLI: https://cli.github.com/
- Dokploy: https://dokploy.com/
- Next.js: https://nextjs.org/
- Docker: https://www.docker.com/
- PostgreSQL: https://www.postgresql.org/
- Drizzle: https://orm.drizzle.team/
- Clerk: https://clerk.com/
- AI SDK: https://ai-sdk.dev/
- OpenAI: https://openai.com/
- Spaceship: https://www.spaceship.com/

Si existe un repositorio propio proporcionado por Ignacio, preferir ese enlace sobre un repositorio de terceros.

Nunca inventar un repositorio.

---

# 16. Diagramas

Cuando el post es suficientemente técnico, los diagramas deben complementar la narrativa.

No reemplazar la explicación por diagramas.

Diagramas recomendados:

### Workflow general

```text
Idea
  ↓
Planificación
  ↓
Claude Code
  ↓
GitHub
  ↓
VPS / Dokploy
  ↓
DNS / dominio
  ↓
Producción
  ↓
Prueba manual
  ↓
Corrección
  └──────────────→ siguiente fase
```

### Infraestructura

```text
Claude Code
   ├── VPS CLI ──→ Dokploy ──→ Apps / Docker / DB / Redis
   └── Spaceship CLI ──→ DNS ──→ dominio
```

### Responsabilidades

```text
Ignacio
├── idea
├── requerimientos
├── decisiones
└── validación final

Claude Code
├── implementación
├── tests
├── GitHub
├── deployment
├── configuración
├── logs
└── correcciones
```

Los diagramas deben ser simples y legibles. No llenar la página con diagramas innecesarios.

---

# 17. Cómo cerrar el post

El cierre debe volver a la idea inicial y mostrar cómo el proceso fue creciendo.

Un buen cierre para este estilo explica que las herramientas no aparecieron todas juntas, sino que fueron apareciendo porque ciertos problemas se repetían.

Ejemplo de dirección narrativa:

> "Y creo que esa es una de las partes que más me interesa de todo este workflow. No estoy intentando hacer una metodología completamente diferente para cada proyecto, sino que cada vez que encuentro una parte que estoy repitiendo demasiado, intento ver si puedo convertirla en una herramienta o automatizarla de alguna manera."

El cierre no debe convertirse en un CTA agresivo, una moraleja o una frase motivacional.

Evitar:

> "Ahora te toca a ti."
> "El futuro ya está aquí."
> "¿Estás listo para construir?"
> "Empieza hoy."

Si hay un CTA, debe ser natural y estar separado del cierre narrativo.

---

# 18. Cosas que NO hacer

## No escribir como presentación

Evitar secuencias como:

> "Primero..."
> "Segundo..."
> "Tercero..."
> "Finalmente..."

cuando la información puede explicarse como una historia.

## No abusar de bullets

Los bullets solo sirven cuando realmente ayudan a enumerar algo. No usar bullets para representar toda la estructura del post.

## No usar frases de una línea como recurso constante

Evitar:

> "Y ahí cambia todo."
>
> "Esto es importante."
>
> "Y funciona."
>
> "Después viene otra cosa."

Si la idea necesita explicación, integrarla dentro del párrafo.

## No inventar la voz

No agregar palabras o conceptos que Ignacio no utilizaría solo porque suenan bien.

## No exagerar

No usar:

- "mágico"
- "revolucionario"
- "sin esfuerzo"
- "completamente autónomo"
- "10x"
- "cambio radical"
- "el futuro"
- "ecosistema"
- "orquestación"

salvo que Ignacio los haya utilizado explícitamente en el material fuente.

## No hacer afirmaciones universales

Preferir:

> "Yo normalmente..."

sobre:

> "La forma correcta de..."

## No convertirlo en un tutorial prematuramente

El post puede enseñar cómo funciona el workflow, pero primero debe contar la historia. La persona debe entender por qué aparece cada paso antes de encontrarse con el detalle técnico.

---

# 19. Checklist antes de entregar un post

Antes de entregar el texto, revisar:

### Voz

- [ ] ¿Parece que Ignacio lo está contando?
- [ ] ¿Está escrito en primera persona cuando corresponde?
- [ ] ¿Las frases desarrollan ideas en lugar de estar cortadas artificialmente?
- [ ] ¿Los párrafos tienen continuidad?
- [ ] ¿Se siente como una narración y no como una presentación?

### Contenido

- [ ] ¿Se explica qué ocurre y por qué ocurre?
- [ ] ¿Las herramientas aparecen dentro del contexto?
- [ ] ¿Se explican los matices y excepciones?
- [ ] ¿Se distingue entre decisiones humanas y trabajo del agente?
- [ ] ¿Se explica la validación manual?
- [ ] ¿Se explica qué ocurre cuando algo falla?
- [ ] ¿Se explica cómo termina una fase?
- [ ] ¿Se muestra cómo las herramientas fueron apareciendo por necesidades reales?

### Estructura

- [ ] ¿Hay una introducción contextual?
- [ ] ¿La historia avanza de manera natural?
- [ ] ¿Hay suficientes detalles?
- [ ] ¿No hay demasiados headings?
- [ ] ¿Los headings marcan cambios reales de tema?
- [ ] ¿El cierre vuelve a conectar con la historia inicial?

### Estilo

- [ ] ¿Hay demasiadas frases de una sola línea?
- [ ] ¿Hay demasiados bullets?
- [ ] ¿Hay frases motivacionales que no vienen de Ignacio?
- [ ] ¿Hay palabras grandilocuentes o de marketing?
- [ ] ¿Se inventó alguna filosofía que Ignacio no expresó?
- [ ] ¿Se convirtió una preferencia personal en una regla universal?
- [ ] ¿El texto avanza demasiado rápido?

### Links

- [ ] ¿Las herramientas propias tienen sus enlaces?
- [ ] ¿Los proyectos propios tienen sus enlaces?
- [ ] ¿Las herramientas externas tienen enlaces oficiales?
- [ ] ¿No se inventó ningún repositorio?
- [ ] ¿Los enlaces están integrados naturalmente dentro del texto?

---

# 20. Regla final de calidad

Antes de entregar el post, leerlo imaginando que Ignacio está explicando el proyecto en una conversación de 15 o 20 minutos.

Si el texto parece una transcripción demasiado literal, hay que ordenarlo.

Si parece un artículo corporativo, hay que hacerlo más conversacional.

Si parece una presentación de bullets, hay que unir las ideas.

Si parece una documentación técnica, hay que volver a introducir el contexto y el porqué.

Si parece demasiado corto, probablemente faltan decisiones, ejemplos o explicaciones que estaban presentes en la conversación original.

Si parece demasiado perfecto o demasiado inspiracional, probablemente se agregaron palabras que Ignacio no utilizaría.

La meta es que el lector sienta que Ignacio le está contando tranquilamente cómo llegó a construir ese workflow, qué fue haciendo en el camino, por qué tomó cada decisión y cómo termina utilizando todo eso cuando empieza un proyecto nuevo.
