// Función serverless (Vercel) — POST /api/analizar
// Recibe una imagen (data URL base64) + tolerancias del lote.
// - Con OPENAI_API_KEY: el modelo de visión cuenta y clasifica los granos.
// - Sin key: "modo demo", solo funciona con las fotos de /ejemplos (conteo conocido).
import EJEMPLOS from "./_ejemplos.js";


const PROMPT = `Eres un inspector de calidad de arroz pilado (blanco) en un molino del Perú.
Analiza la foto de la muestra y clasifica CADA grano visible en una de tres clases:
- "entero": grano completo o con longitud >= 3/4 del grano entero.
- "quebrado": fragmento con longitud < 3/4 del grano entero (criterio NTP 205.011).
- "tizoso": grano con zona blanca opaca/yesosa que ocupa la mitad o más del grano.
Si un grano es quebrado Y tizoso, cuéntalo como quebrado.
Asume que la imagen es una muestra de arroz salvo que sea claramente otra cosa (persona, paisaje, documento). Aunque la foto sea imperfecta, cuenta los granos que puedas identificar.
Responde SOLO con JSON con esta forma exacta:
{"es_arroz": true, "enteros": 0, "quebrados": 0, "tizosos": 0, "confianza": "alta|media|baja", "observacion": "texto breve en español"}`;

async function analizarConOpenAI(imagen, apiKey) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Clasifica los granos de esta muestra." },
            { type: "image_url", image_url: { url: imagen, detail: "high" } },
          ],
        },
      ],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Error en OpenAI");
  return { ...JSON.parse(data.choices[0].message.content), modo: "openai" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const { imagen, ejemplo, maxQuebrados = 8, maxTizosos = 4 } = body;
  const apiKey = process.env.OPENAI_API_KEY;

  try {
    let ia;
    if (apiKey) {
      if (!imagen || !String(imagen).startsWith("data:image/")) {
        return res.status(400).json({ error: "Envía 'imagen' como data URL (data:image/jpeg;base64,...)" });
      }
      ia = await analizarConOpenAI(imagen, apiKey);
    } else if (ejemplo && EJEMPLOS[ejemplo]) {
      ia = { es_arroz: true, ...EJEMPLOS[ejemplo], confianza: "alta", observacion: "Modo demo: conteo de referencia de la foto de ejemplo.", modo: "demo" };
    } else {
      return res.status(400).json({
        error: "Sin OPENAI_API_KEY solo se pueden analizar las fotos de ejemplo. Configura la key para analizar fotos propias.",
      });
    }

    // Los porcentajes se calculan aquí (no se confía en la aritmética del modelo)
    const enteros = Number(ia.enteros || 0), quebrados = Number(ia.quebrados || 0), tizosos = Number(ia.tizosos || 0);
    const total = enteros + quebrados + tizosos;
    const pct = (n) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
    const pctQuebrados = pct(quebrados), pctTizosos = pct(tizosos);

    const coma = (n) => String(n).replace(".", ",");
    const alertas = [];
    if (pctQuebrados > Number(maxQuebrados)) alertas.push(`Quebrados ${coma(pctQuebrados)} % sobre el límite de ${coma(maxQuebrados)} %`);
    if (pctTizosos > Number(maxTizosos)) alertas.push(`Tizosos ${coma(pctTizosos)} % sobre el límite de ${coma(maxTizosos)} %`);

    return res.status(200).json({
      esArroz: ia.es_arroz !== false && total > 0,
      total, enteros, quebrados, tizosos, pctQuebrados, pctTizosos,
      confianza: ia.confianza || "media",
      observacion: ia.observacion || "",
      modo: ia.modo,
      alertas,
      estado: alertas.length ? "ALERTA" : "OK",
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
