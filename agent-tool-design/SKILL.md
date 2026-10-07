---
name: agent-tool-design
description: Design and debug the tools an LLM agent calls — check the action exists before blaming reasoning, put instructions in the tool result that precedes the decision rather than in the system prompt, name available resources inside tool descriptions, let the model choose WHICH (index or allow-listed name) never WHAT (a raw URL), guard browser tools against SSRF on every request, and log tool failures server-side. Use when an agent "doesn't think of" doing something, follows a prompt instruction only sometimes, ignores a tool it has, needs to fetch URLs or browse safely, or when building tools with the Vercel AI SDK, Claude tool use or MCP.
metadata:
  author: Jibaru
  version: 1.0.0
---

# agent-tool-design

When an agent behaves badly, the cause is usually its tools: what they can do, what they say about
themselves, and where they put the instructions. Every rule here comes from
[whatsapp-bot-sst](https://github.com/Jibaru/whatsapp-bot-sst), a WhatsApp bot (Vercel AI SDK
`tool()` + zod) that answers workplace-safety questions from a document library, from
authorized web sources, and from links people share. Commits cited (`dc2c120`, `11af394`)
are in that repo. Files are under `src/modules/agent/` unless noted.

## 1. Before blaming reasoning, list what the agent can actually do this turn

The user's report: "it's as if it doesn't use the URLs; it gives too much weight to the library.
Isn't there a way for it to loop more or think more? Why didn't its chain of thought consider the URL?"
The question that triggered it was "@Goodbot dame el último reporte de sismo" (give me the latest
earthquake report). The bot answered with an evacuation-drill register, even though the national seismology center
had been registered as an authorized source for days.

The actual diagnosis (commit `dc2c120`): `consultar_fuentes` only read alerts that were already
stored (its own description said "no busca en internet", it doesn't search the internet), and
`ver_pagina` only opened links present in the message. Nobody had pasted a link. **No chain of
thought could reach that page.** The model wasn't skipping an option, because the option didn't exist.
More loops or more thinking would have spent money in a dead end.

When an agent "doesn't realise" it should do X, first **enumerate the actions available in
that turn** and their parameters. Ask whether any of them can do X with the inputs present. Often the
failure is capability, not reasoning.

## 2. Put the instruction where the decision is made, not in the prompt

After `ver_pagina` could open authorized sources, the system prompt said so. The model used it
**sometimes**: one run opened the source, and the next run, same question, answered with an
unrelated health-surveillance report. This repo had already learned the lesson twice before (for
regulation lookups and for regulatory-change alerts).

The fix (`11af394`) moves the reminder **into the result of `buscar_en_biblioteca`** as an
extra field, present only when the question is about the present (`tools/search-library.ts`):

```ts
function currentReminder(sources: AuthorisedSource[]): string {
  return (
    "La pregunta es por información actual, y la biblioteca no la tiene: guarda documentos, no " +
    "el presente. Antes de responder abre con ver_pagina la fuente autorizada que publique eso " +
    `(disponibles: ${sources.map((source) => source.label).join(", ")}). ` +
    "Encontrar pasajes del mismo tema no es tener el dato de hoy, y un registro o un formato no " +
    "es la respuesta a qué pasó hoy."
  );
}
```

It's attached to **both** branches, the one with results and the one with none. The empty-result
branch is when the model most wants to give up:

```ts
// no passages found
...(liveReminder ? { fuente_en_vivo: liveReminder } : {}),
// passages found
...(liveReminder ? { fuente_en_vivo: liveReminder } : {}),
```

Three consecutive runs, and it opened the source all three times. An instruction that arrives
attached to what it's about gets followed. One read a thousand tokens earlier doesn't. **If a
prompt instruction is followed intermittently, move it into the result of the tool that
precedes the decision, and make it conditional on the case.**

The condition itself needed a test. The first `asksForCurrent` used `\b`, which isn't a boundary next to
`ú` without the `u` flag, so "hoy" matched and "último" didn't, and "último" was the word in the
original question. It now uses Unicode lookarounds:

```ts
/(?<!\p{L})(últim[oa]s?|ultim[oa]s?|hoy|ahora|reciente|recientes|actual|actuales|al día|en vivo|esta semana|este mes|acaba de|de hoy)(?!\p{L})/iu
```

## 3. Name the available resources inside the tool description

A parameter that accepts `fuente` isn't enough. The description is built **per turn** with the
current list injected (`tools/page.ts`):

```ts
description:
  "Abre una página web en un navegador y lee lo que muestra, ahora mismo. Dos orígenes: un " +
  "enlace que esté en el mensaje o en el mensaje citado, o una de las fuentes que el " +
  "administrador autorizó. Úsala cuando pregunten por información actual que la biblioteca " +
  "no puede tener —lo último publicado, el estado de hoy, un dato en vivo— y cuando " +
  "compartan el enlace de una página. …" +
  (sources && sources.length > 0
    ? ` Fuentes autorizadas disponibles: ${sources.map((source) => `"${source.label}"`).join(", ")}.`
    : " No hay fuentes autorizadas registradas: solo sirve con un enlace del mensaje."),
```

A tool that can do something but doesn't say so is a tool the model won't use for it. Load the
resources before the turn and name them. When there are none, say that too, so the model
doesn't promise what it can't do.

## 4. The model chooses WHICH, never WHAT

Capture tools take **no URL parameter**. They take an index into the links a person wrote,
or a name from an admin-curated list:

```ts
inputSchema: z.object({
  fuente: z.string().optional()
    .describe("El nombre de una de las fuentes autorizadas, tal como aparece en la lista. …"),
  cual: z.number().int().min(1).optional()
    .describe("Cuál de los enlaces del mensaje, contando desde 1. Omítelo si hay uno solo."),
  buscar: z.string().optional()
    .describe("Qué hay que encontrar en la página, si es más preciso que la pregunta original."),
}),
```

The address has to appear in text a human typed, or in a list an administrator registered.
A message can't talk the bot into `http://127.0.0.1:3000/api/cron/diario` or the cloud
metadata endpoint `http://169.254.169.254/latest/meta-data/` (both are cases in
`scripts/checks/enlaces.ts`).

### And guard every request, because a browser isn't a fetch

The chosen URL still goes through an SSRF guard (`src/modules/sources/safe-fetch.ts`:
`assertAllowedScheme` + `assertPublicHost`, with redirects followed by hand,
`redirect: "manual"`, so every hop gets checked). For a headless browser that's not enough. A page runs
scripts, follows its own redirects, loads iframes, and any of those can target the private network the
container sits in. So the guard runs on **every request the page makes**
(`src/modules/browser/render.ts`):

```ts
await context.route("**/*", async (route) => {
  const kind = route.request().resourceType();
  if (kind === "font" || kind === "media") return route.abort();   // cost, not security

  try {
    const target = new URL(route.request().url());
    assertAllowedScheme(target);
    await assertPublicHost(target.hostname);
    await route.continue();
  } catch {
    await route.abort();
  }
});
```

## 5. Tool errors go to the model and to the server log

The first time the browser failed in production, the reason existed only in the chat: the group
saw "the page didn't load", and the server logs had nothing. A whole round went to guessing. Then
`tools/page.ts` started logging:

```ts
console.error("[navegador] no se pudo leer la página", { enlace: chosen, motivo: reason });
```

and the next failure produced the exact `MODULE_NOT_FOUND` within a minute. Every error result
goes back to the model **and** gets logged on the server. Those are two audiences, and the server log
is the one that debugs.

## 6. Prove the behaviour with the real question

`pnpm check:fuentes-vivo` (`scripts/checks/fuentes-vivo.ts`) seeds the authorized source, asks
the group's question verbatim, and checks that the agent opens the page on its own and doesn't fall
back to the drill register. Before the fix it fails, reproducing the three
`buscar_en_biblioteca` calls seen in production. Agent behaviour is probabilistic, so run the check
several times, as the three consecutive runs above did. One pass proves little.

## Checklist

- [ ] For a "the agent doesn't do X" report: listed the turn's tools and confirmed one of them can do
      X with the inputs present.
- [ ] Instructions that must drive a decision ride in the preceding tool's result, conditionally,
      on every branch, including empty results.
- [ ] Tool descriptions name the resources available this turn, and say when there are none.
- [ ] No tool takes a free-form URL, path or command from the model. It picks from human or admin input.
- [ ] Browser tools validate every request (`route("**/*")`), not just the first URL.
- [ ] Every tool error is logged server-side with its inputs.
- [ ] A scripted check replays the real question, several times, and fails without the fix.
