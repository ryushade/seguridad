# 🗳️ Monitor de Resultados — Segunda Elección Presidencial Perú 2026

Dashboard **no oficial** de seguimiento en vivo y proyección estadística de la segunda vuelta presidencial peruana 2026 (Fujimori vs. Sánchez), construido sobre los datos públicos de la **ONPE** y del **JNE**.

**🌐 Demo en vivo:** https://ryushade.github.io/seguridad/

> ⚠️ Monitor con fines analíticos y educativos. Las proyecciones son estimaciones estadísticas, **no resultados oficiales**; la proclamación del ganador corresponde exclusivamente al **JNE**.

---

## ✨ Funcionalidades

| Sección | Contenido |
|---|---|
| **Resumen General** | KPIs en vivo (actas, participación, diferencia, probabilidad ML), tarjetas de candidatos con anillo de progreso, barra de avance del conteo estilo ONPE y evolución interactiva de la brecha |
| **Presidencial** | Resultados nacionales y por ámbito (Perú territorial / Extranjero) + escenarios deterministas Pro-Sánchez · Central · Pro-Fujimori |
| **Participación Ciudadana** | Participación nacional y por ámbito, votos emitidos/válidos/nulos/blancos, mesas instaladas |
| **Actas y Observadas** | Estado de actas ONPE + reporte oficial del JNE: expedientes, **avance de recuento de votos**, y tabla completa por **Jurado Electoral Especial** con buscador, filtro por zona, ordenamiento y **modal de detalle por JEE** (👁️) con impacto político estimado |
| **Proyecciones** | ETA del cambio de líder, curva de cruce, Monte Carlo (30k escenarios), proyección con base histórica 2021, **modelo bayesiano Beta-Binomial** y **predicción ML** (Gradient Boosting) con importancia de variables |

## 🏗️ Arquitectura

```
┌──────────────── LOCAL ────────────────┐    ┌────────────── GITHUB PAGES ──────────────┐
│ ONPE API ◄── server.js (proxy :5173)  │    │ GitHub Action (cron */5, poller 40 s)     │
│              ├─ /api/resumen|history  │    │   └─ onpe-snapshot.mjs ◄── ONPE API       │
│              ├─ /api/ml  /api/mesas   │    │        └─ commit snapshot/*.json          │
│              └─ sirve web/dist        │    │             └─ Pages republica (~30 s)    │
│ predict.py --loop (ML, 150 s)         │    │ Frontend re-consulta cada 20 s            │
│ watchdog.cmd (tarea programada 1 min) │    │ → frescura efectiva ~1–2 min              │
└───────────────────────────────────────┘    └───────────────────────────────────────────┘
```

- **Frontend:** Vite + React + TypeScript + Tailwind v4 + **shadcn/ui** (bloque oficial `dashboard-01`: sidebar, cards, charts con Recharts, tabla TanStack). 100 % responsivo.
- **Proxy local (`server.js`):** Node sin dependencias. Evita CORS y el filtro de cabeceras (`Sec-Fetch-*`) del CDN de la ONPE, persiste el histórico de la brecha y sirve el build de producción.
- **ML (`ml/predict.py`):** scikit-learn — clasificador surrogate Gradient Boosting + regresión cuantílica sobre 12k escenarios composicionales.
- **Modo Pages:** sin backend; los datos viven en `snapshot/*.json`, refrescados por el bot de Actions. El frontend intenta `/api/*` y cae automáticamente al snapshot con cache-bust.

## 📡 Fuentes de datos

| Fuente | Mecanismo | Frecuencia |
|---|---|---|
| **ONPE** `presentacion-backend` (totales, participantes por ámbito, mesas) | API JSON pública (requiere cabeceras de navegador) | Local: 20 s · Pages: poller del bot cada **40 s** (commit solo si cambian los datos) |
| **JNE** «Procesamiento de Actas Observadas» (Power BI) | Lectura del reporte oficial → `snapshot/jne.json` | Manual* — editable en `gh-pages` sin rebuild |
| Histórico de la brecha | Acumulado por el proxy/bot en `history.json` | Automático |

\* El reporte del JNE es un Power BI embebido tras Incapsula: no expone API scrapeable de forma estable. Para actualizarlo basta **editar `snapshot/jne.json` en la rama `gh-pages`** (mismo esquema: `snapshot`, `tot`, `recuento`, `table[]`) — el dashboard lo recoge en ≤60 s sin recompilar.

## 📊 Modelos estadísticos

1. **Escenarios deterministas** — reparto del remanente por ámbito (doméstico ponderado por la geografía de las actas observadas: ~62 % Lima/Callao).
2. **Monte Carlo** (30 000 escenarios) — incertidumbre gaussiana sobre los repartos pendientes + ruido de resolución JEE/JNE.
3. **Proyección histórica 2021** — ancla en el voto exterior de la 2.ª vuelta 2021 (Fujimori 66.48 %).
4. **Bayesiano Beta-Binomial** *(estilo Linzer)* — actualización conjugada del share exterior: prior 2021 + verosimilitud del conteo en vivo, muestreando por acta (efecto de diseño por conglomerados).
5. **ML surrogate** — `GradientBoostingClassifier` (AUC ≈ 0.999) + cuantiles P10/P50/P90; aporta probabilidad calibrada, **importancia de variables** y el **punto de quiebre** del voto exterior.

**Literatura:** Linzer (2013) *JASA*; Heidemanns, Gelman & Morris (2020) *HDSR*; Klimek et al. (2012) *PNAS*; Mebane (2006) *Election Forensics*.

## 🚀 Desarrollo local

```bash
# 1. Proxy + dashboard de producción (un solo proceso)
cd onpe-live && node server.js          # → http://localhost:5173

# 2. (opcional) Modelo ML en bucle
cd onpe-live/ml && python predict.py --loop

# 3. (opcional) Frontend en modo desarrollo
cd onpe-live/web && npm install && npm run dev   # → http://localhost:5174

# Auto-arranque en Windows (tarea programada cada 1 min):
schtasks /create /tn ONPE_Dashboard_Watchdog /tr "cmd /c <ruta>\onpe-live\watchdog.cmd" /sc minute /mo 1
```

## 📦 Despliegue a GitHub Pages

```bash
bash onpe-live/deploy.sh
```

El script compila con `GHPAGES=1` (base `/seguridad/`), reemplaza el contenido de la rama `gh-pages` **preservando `.github/`** (el bot) y los snapshots frescos, y pushea. El workflow [`onpe-live.yml`](.github/workflows/onpe-live.yml) corre en la rama `gh-pages` (default del remoto): cron cada 5 min + **bucle interno de 40 s** → los datos de la ONPE aterrizan en Pages ~1–2 min después de cambiar. También puede dispararse a mano: *Actions → ONPE live snapshot → Run workflow*.

## 📁 Estructura

```
onpe-live/
├── server.js            # proxy ONPE + estático + histórico (sin deps)
├── watchdog.cmd         # vigilante: revive proxy y ML (tarea programada)
├── deploy.sh            # build + deploy a gh-pages
├── analyze.js           # análisis Monte Carlo puntual por CLI
├── ml/predict.py        # pipeline scikit-learn → prediction.json
└── web/                 # Vite + React + shadcn/ui (dashboard-01)
    ├── src/App.tsx              # vistas y tarjetas
    ├── src/lib/onpe.ts          # tipos + MC + Bayes + cruce + ETA
    ├── src/components/          # sidebar, header, KPIs, chart, tabla JNE
    └── public/snapshot/*.json   # datos para modo estático (Pages)
.github/
├── workflows/onpe-live.yml      # bot: cron */5 + poller interno 40 s
└── scripts/onpe-snapshot.mjs    # consulta ONPE y escribe snapshots
```

## ⚖️ Disclaimer

Proyecto independiente sin afiliación con ONPE ni JNE. Los datos provienen de sus plataformas públicas; las marcas y fotos de candidatos pertenecen a sus titulares. El margen proyectado está dentro del rango de impugnaciones: **el resultado oficial lo proclama el JNE**.
