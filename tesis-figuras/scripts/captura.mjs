#!/usr/bin/env node
// Capturas de pantalla del sistema web para la sección de implementación de la tesis.
//
// Uso:
//   node captura.mjs --proyecto RUTA capturas.json
//
// capturas.json:
// {
//   "base": "http://localhost:3000",
//   "viewport": { "width": 1366, "height": 768 },
//   "escala": 2,
//   "almacenamiento": "figuras/src/sesion.json",      // opcional: sesión iniciada (storageState)
//   "capturas": [
//     { "nombre": "login", "url": "/login" },
//     { "nombre": "panel-conversaciones", "url": "/panel",
//       "pasos": [
//         { "llenar": "#email", "valor": "demo@ejemplo.com" },
//         { "llenar": "#password", "valorEnv": "DEMO_PASSWORD" },
//         { "clic": "button[type=submit]" },
//         { "esperar": "text=Conversaciones" }
//       ],
//       "selector": "main",            // opcional: recorta al elemento
//       "ocultar": [".avatar", ".telefono"],   // opcional: difumina datos personales
//       "paginaCompleta": false }
//   ]
// }
//
// Pasos soportados: ir, clic, llenar (+ valor | valorEnv), presionar, esperar (selector o
// "text=..."), esperarMs, evaluar (JS). Las credenciales van en variables de entorno
// (valorEnv), nunca en el JSON.
//
// Requiere Playwright: npm i -D playwright && npx playwright install chromium

import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
let proyecto = ".";
const i = args.indexOf("--proyecto");
if (i >= 0) {
  proyecto = args[i + 1];
  args.splice(i, 2);
}

// Playwright se busca junto al script o, si no, en el proyecto de tesis (npm i -D playwright ahí).
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  try {
    ({ chromium } = createRequire(path.join(path.resolve(proyecto), "package.json"))("playwright"));
  } catch {
    console.error("Falta Playwright. En el proyecto: npm i -D playwright && npx playwright install chromium");
    process.exit(1);
  }
}
if (args.length !== 1) {
  console.error("Uso: node captura.mjs --proyecto RUTA capturas.json");
  process.exit(2);
}

const raiz = path.resolve(proyecto);
const cfgPath = path.resolve(raiz, args[0]);
const cfg = JSON.parse(await readFile(cfgPath, "utf8"));
const out = path.join(raiz, "figuras", "out");
await mkdir(out, { recursive: true });

const url = (u) => (/^https?:|^file:/.test(u) ? u : new URL(u, cfg.base).toString());

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: cfg.viewport ?? { width: 1366, height: 768 },
  deviceScaleFactor: cfg.escala ?? 2,
  locale: "es-PE",
  storageState: cfg.almacenamiento ? path.resolve(raiz, cfg.almacenamiento) : undefined,
});
const page = await context.newPage();

async function paso(p) {
  if (p.ir) await page.goto(url(p.ir), { waitUntil: "networkidle" });
  else if (p.clic) await page.click(p.clic);
  else if (p.llenar) {
    const valor = p.valorEnv ? process.env[p.valorEnv] : p.valor;
    if (valor === undefined) throw new Error(`Variable de entorno ${p.valorEnv} no definida`);
    await page.fill(p.llenar, valor);
  } else if (p.presionar) await page.keyboard.press(p.presionar);
  else if (p.esperar) await page.waitForSelector(p.esperar, { timeout: 15000 });
  else if (p.esperarMs) await page.waitForTimeout(p.esperarMs);
  else if (p.evaluar) await page.evaluate(p.evaluar);
  else throw new Error(`Paso desconocido: ${JSON.stringify(p)}`);
}

let errores = 0;
for (const c of cfg.capturas) {
  try {
    if (c.url) await page.goto(url(c.url), { waitUntil: "networkidle" });
    for (const p of c.pasos ?? []) await paso(p);
    for (const sel of c.ocultar ?? []) {
      await page.locator(sel).evaluateAll((els) =>
        els.forEach((e) => (e.style.filter = "blur(6px)")),
      );
    }
    await page.waitForTimeout(300); // animaciones
    const archivo = path.join(out, `${c.nombre}.png`);
    if (c.selector) await page.locator(c.selector).first().screenshot({ path: archivo });
    else await page.screenshot({ path: archivo, fullPage: !!c.paginaCompleta });
    console.log(`→ ${path.relative(raiz, archivo)}`);
  } catch (e) {
    errores++;
    console.error(`ERROR en ${c.nombre}: ${e.message}`);
  }
}

if (cfg.guardarSesion) {
  await context.storageState({ path: path.resolve(raiz, cfg.guardarSesion) });
}
await browser.close();
process.exit(errores ? 1 : 0);
