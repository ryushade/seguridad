// Bot de snapshots ONPE para GitHub Pages.
// Replica la lógica del proxy local (onpe-live/server.js): consulta la API
// pública de la ONPE con las cabeceras de navegador que exige su CDN y escribe
// los JSON que consume el dashboard estático. Uso: node onpe-snapshot.mjs <dirSalida>
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const OUT = process.argv[2] || "site/snapshot"
const ROOT = "https://resultadosegundavuelta.onpe.gob.pe/presentacion-backend"
const TOT = ROOT + "/resumen-general/totales"
const PART = ROOT + "/eleccion-presidencial/participantes-ubicacion-geografica-nombre"

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/148.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
  "Referer": "https://resultadosegundavuelta.onpe.gob.pe/main/presidenciales",
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: HEADERS })
  const t = await r.text()
  if (t.trim().startsWith("<")) throw new Error("ONPE devolvio HTML (fingerprint)")
  return JSON.parse(t)
}

const cand = (arr, re) => arr.find((c) => re.test(c.nombreAgrupacionPolitica || ""))

async function getAmbito(amb) {
  const q = `idEleccion=10&tipoFiltro=ambito_geografico&idAmbitoGeografico=${amb}`
  const [tot, part] = await Promise.all([fetchJson(`${TOT}?${q}`), fetchJson(`${PART}?${q}`)])
  const t = tot.data
  const s = cand(part.data, /JUNTOS/), k = cand(part.data, /FUERZA/)
  const nulos = cand(part.data, /NULO/), blancos = cand(part.data, /BLANCO/)
  const contab = t.contabilizadas, total = t.totalActas, validos = t.totalVotosValidos
  const sV = s.totalVotosValidos, kV = k.totalVotosValidos
  const vpa = contab > 0 ? validos / contab : 0
  const remActas = Math.max(0, total - contab)
  const remVotos = Math.round(remActas * vpa)
  return {
    actasPct: t.actasContabilizadas, contab, total, validos,
    sanchez: sV, keiko: kV, pctSanchez: s.porcentajeVotosValidos, pctKeiko: k.porcentajeVotosValidos,
    remActas, remVotos, pShareSanchez: (sV + kV) > 0 ? sV / (sV + kV) : 0.5,
    enviadasJee: t.enviadasJee, pendientesJee: t.pendientesJee, votosPorActa: Math.round(vpa),
    participacion: t.participacionCiudadana, emitidos: t.totalVotosEmitidos,
    nulos: nulos ? nulos.totalVotosValidos : null, blancos: blancos ? blancos.totalVotosValidos : null,
  }
}

function proj(a, shareSanchez) {
  const s = a.sanchez + a.remVotos * shareSanchez
  const k = a.keiko + a.remVotos * (1 - shareSanchez)
  return { s, k }
}
function combine(d, e) {
  const s = d.s + e.s, k = d.k + e.k, tot = s + k
  return {
    sanchez: Math.round(s), keiko: Math.round(k), margin: Math.round(s - k),
    pctSanchez: +((s / tot) * 100).toFixed(3), pctKeiko: +((k / tot) * 100).toFixed(3),
    ganador: s >= k ? "SÁNCHEZ" : "KEIKO",
  }
}

const [dom, ext] = await Promise.all([getAmbito(1), getAmbito(2)])

const dS = dom.pShareSanchez, eS = ext.pShareSanchez
const OBS_LIMA_W = 0.62, LIMA_S = 0.40
const dSObs = OBS_LIMA_W * LIMA_S + (1 - OBS_LIMA_W) * dS
const escenarios = {
  proSanchez: combine(proj(dom, dS), proj(ext, Math.min(0.5, eS + 0.05))),
  central: combine(proj(dom, dSObs), proj(ext, eS)),
  proKeiko: combine(proj(dom, Math.max(0.4, dSObs - 0.03)), proj(ext, Math.max(0.28, eS - 0.05))),
}

const curS = dom.sanchez + ext.sanchez, curK = dom.keiko + ext.keiko
const curTot = curS + curK
const natActasPct = +(((dom.contab + ext.contab) / (dom.total + ext.total)) * 100).toFixed(3)
const resumen = {
  actualizado: Date.now(),
  nacional: {
    sanchez: curS, keiko: curK,
    pctSanchez: +((curS / curTot) * 100).toFixed(3), pctKeiko: +((curK / curTot) * 100).toFixed(3),
    margin: curS - curK, actasPct: natActasPct,
  },
  dom, ext, escenarios,
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, "resumen.json"), JSON.stringify(resumen))

// history: anexar el punto nuevo al historial existente
let history = []
const hPath = join(OUT, "history.json")
if (existsSync(hPath)) { try { history = JSON.parse(readFileSync(hPath, "utf8")) } catch { history = [] } }
const last = history[history.length - 1]
const pt = { ts: Date.now(), pct: natActasPct, margin: curS - curK, extPct: +(+ext.actasPct).toFixed(3) }
if (!last || last.pct !== pt.pct || last.margin !== pt.margin) history.push(pt)
if (history.length > 5000) history = history.slice(-5000)
writeFileSync(hPath, JSON.stringify(history))

// mesas
try {
  const m = await fetchJson(`${ROOT}/mesa/totales?idEleccion=10&tipoFiltro=eleccion`)
  writeFileSync(join(OUT, "mesas.json"), JSON.stringify(m.data || m))
} catch { /* opcional */ }

console.log(`snapshot OK: nacional ${natActasPct}% margen ${curS - curK >= 0 ? "+" : ""}${curS - curK} ext ${ext.actasPct}%`)
