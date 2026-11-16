# Arroz QC — Prototipo Molino Don Manuel

Prototipo del sistema de control de calidad del arroz pilado: se sube la foto de una muestra,
un modelo de visión de OpenAI cuenta y clasifica los granos (enteros / quebrados / tizosos),
se calculan los porcentajes, se comparan con las tolerancias del lote y se genera alerta si se superan.

Viene con datos de demostración: 7 lotes (4 procesados, 3 pendientes), 42 muestras con foto,
alertas atendidas con su calibración y 6 fotos de ejemplo para analizar.

## Estructura

```
arroz-qc/
├── api/
│   ├── analizar.js       # Función serverless (Vercel): llama a OpenAI, calcula % y alertas
│   └── _ejemplos.js      # Conteo real de las fotos de ejemplo (modo demo)
├── public/
│   ├── index.html        # Pantallas: login, configurar lote, monitoreo, historial/reporte
│   ├── app.js            # Lógica del frontend (datos en localStorage)
│   ├── styles.css
│   ├── data/seed.json    # Datos demo precargados
│   ├── muestras/         # Fotos de las 42 muestras registradas
│   └── ejemplos/         # 6 fotos para probar "Analizar muestra"
├── server.js             # Servidor local para desarrollo (no se usa en Vercel)
├── package.json
├── .env.example
└── .gitignore
```

## Dos modos de análisis

| Modo | Cuándo | Qué analiza |
|---|---|---|
| **Demo** | No hay `OPENAI_API_KEY` | Solo las 6 fotos de ejemplo (devuelve su conteo real) |
| **OpenAI** | Hay `OPENAI_API_KEY` | Cualquier foto (ejemplos o subidas por el usuario) |

## Correr en local

Requisito: Node.js 18 o superior. No hay dependencias (`npm install` no es necesario).

```bash
npm run dev                 # o: node server.js
```

Abre http://localhost:3000. Para usar OpenAI, copia `.env.example` a `.env` y pega tu key.

Usuarios demo (cualquier contraseña de 8–20 caracteres; el login trae `demo1234` precargado):
- **Operario**: configurar lote, monitoreo, atender alertas, historial.
- **Administrador**: historial con todos los filtros y reportes.
- **Productor (Juan Pérez)**: solo ve sus lotes (L-009 y L-014).

El botón **Restablecer datos demo** (barra lateral) vuelve todo al estado inicial.

## Desplegar en Vercel

Ver pasos en la sección de despliegue de la entrega, o resumen:
1. Subir el repo a GitHub.
2. vercel.com → Add New → Project → importar el repo → Framework Preset **Other** → Deploy.
3. (Opcional) Settings → Environment Variables → `OPENAI_API_KEY` → Redeploy.

## Limitaciones (prototipo)

- Las fotos de demo son **sintéticas** (generadas por computadora), no fotos reales.
- El análisis lo hace un LLM con visión, no un modelo entrenado propio: los conteos son aproximados.
  No garantiza el F1 ≥ 0.90 del RNF-CAL-001.
- Login de demostración (sin usuarios reales ni hash de contraseñas).
- Los datos viven en el `localStorage` de cada navegador; no hay base de datos compartida.
- "Excel" descarga un CSV (se abre en Excel); "PDF" usa Imprimir → Guardar como PDF del navegador.
