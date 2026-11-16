// Frontend del prototipo. Los datos viven en localStorage; la primera vez se cargan de /data/seed.json.
const $ = (id) => document.getElementById(id);
const DB_KEY = "arroz-qc-db";
const VERSION = 2;
const EJEMPLOS = [1, 2, 3, 4, 5, 6].map((n) => `ejemplo-${n}.jpg`);
const PRODUCTOR_DEMO = "Juan Pérez";
const MIN_MUESTRAS_REPORTE = 3;

// ---------- "Base de datos" local ----------
let DB;
async function cargar() {
  const d = JSON.parse(localStorage.getItem(DB_KEY) || "null");
  if (d && d.version === VERSION) return (DB = d);
  return reset();
}
async function reset() {
  const seed = await (await fetch("/data/seed.json")).json();
  DB = { ...seed, version: VERSION, sesion: DB?.sesion || null };
  save();
  return DB;
}
function save() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); }
  catch { alert("El almacenamiento del navegador está lleno. Usa 'Restablecer datos demo'."); }
}
const loteActivo = () => DB.lotes.find((l) => l.id === DB.activo && l.estado === "En proceso");
const fmt = (n) => (n == null ? "–" : n.toFixed(1).replace(".", ",") + " %");
const fechaCorta = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "–");
const prom = (arr, k) => (arr.length ? arr.reduce((s, m) => s + m[k], 0) / arr.length : null);

// ---------- Sesión (CU-01) ----------
$("f-login").onsubmit = (e) => {
  e.preventDefault();
  const pass = $("l-pass").value;
  if (pass.length < 8 || pass.length > 20) return ($("l-err").textContent = "Credenciales inválidas: la contraseña debe tener entre 8 y 20 caracteres.");
  DB.sesion = { email: $("l-email").value, rol: $("l-rol").value };
  save();
  entrar();
};
$("logout").onclick = (e) => { e.preventDefault(); DB.sesion = null; save(); location.reload(); };
$("reset").onclick = async () => {
  if (!confirm("¿Restablecer todos los datos a la demo inicial?")) return;
  await reset(); entrar();
};

function entrar() {
  if (!DB.sesion) return;
  $("v-login").classList.add("hidden");
  $("v-app").classList.remove("hidden");
  const rol = DB.sesion.rol;
  $("rol").textContent = rol === "Productor" ? `Productor · ${PRODUCTOR_DEMO}` : rol;
  const menu = rol === "Operario"
    ? [["s-config", "Configurar lote"], ["s-mon", "Monitoreo"], ["s-hist", "Historial"]]
    : [["s-hist", "Historial"]];
  $("nav").innerHTML = menu.map(([id, t]) => `<a href="#" data-s="${id}">${t}</a>`).join("");
  $("nav").querySelectorAll("a").forEach((a) => (a.onclick = (e) => { e.preventDefault(); ir(a.dataset.s); }));
  ir(rol === "Operario" ? "s-mon" : "s-hist");
}

function ir(screen) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("hidden", s.id !== screen));
  $("nav").querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.s === screen));
  ({ "s-config": pintarConfig, "s-mon": pintarMonitoreo, "s-hist": iniciarHistorial })[screen]();
}

// ---------- Configurar lote (CU-04) ----------
function pintarConfig() {
  const pendientes = DB.lotes.filter((l) => l.estado === "Pendiente");
  $("c-lote").innerHTML = pendientes.map((l) => `<option>${l.id}</option>`).join("") || "<option value=''>No hay lotes pendientes</option>";
  mostrarLote();
}
$("c-lote").onchange = mostrarLote;
function mostrarLote() {
  const l = DB.lotes.find((x) => x.id === $("c-lote").value);
  $("c-var").textContent = l?.variedad || "-";
  $("c-cal").textContent = l?.calidad || "-";
  $("c-prod").textContent = l?.productor || "-";
  // valores de referencia según calidad objetivo
  if (l) { $("c-q").value = l.calidad === "Extra" ? 8 : 10; $("c-t").value = l.calidad === "Extra" ? 4 : 5; }
}
$("c-save").onclick = () => {
  const q = parseFloat($("c-q").value), t = parseFloat($("c-t").value), i = parseInt($("c-i").value);
  const ok = (v) => !isNaN(v) && v >= 0 && v <= 100;
  if (!ok(q) || !ok(t)) return ($("c-err").textContent = "Las tolerancias deben estar entre 0 % y 100 %.");
  if (!(i >= 1)) return ($("c-err").textContent = "El intervalo debe ser de al menos 1 minuto.");
  const l = DB.lotes.find((x) => x.id === $("c-lote").value);
  if (!l) return ($("c-err").textContent = "Selecciona un lote.");
  const enCurso = loteActivo();
  if (enCurso && !confirm(`El lote ${enCurso.id} sigue en proceso. ¿Finalizarlo e iniciar ${l.id}?`)) return;
  if (enCurso) enCurso.estado = "Finalizado";
  const ahora = new Date().toISOString();
  l.config = { maxQuebrados: q, maxTizosos: t, intervalo: i, fecha: ahora, responsable: DB.sesion.email };
  l.estado = "En proceso";
  l.fecha = ahora.slice(0, 10);
  DB.activo = l.id;
  save();
  $("c-err").textContent = "";
  ir("s-mon");
};

// ---------- Monitoreo (CU-05) ----------
let imagenDataUrl = null, ejemploSel = null, thumbSel = null;

$("m-gal").innerHTML = EJEMPLOS.map((e) => `<img src="/ejemplos/${e}" data-e="${e}" alt="${e}" title="${e}">`).join("");
$("m-gal").querySelectorAll("img").forEach((img) => (img.onclick = async () => {
  $("m-gal").querySelectorAll("img").forEach((x) => x.classList.toggle("sel", x === img));
  $("m-file").value = "";
  ejemploSel = img.dataset.e;
  thumbSel = `/ejemplos/${ejemploSel}`;
  imagenDataUrl = await comprimir(await (await fetch(thumbSel)).blob());
  $("m-prev").classList.add("hidden");
  $("m-run").disabled = !loteActivo();
}));

// Foto propia (archivo o cámara) → lista para analizar
async function usarFoto(blob) {
  $("m-gal").querySelectorAll("img").forEach((x) => x.classList.remove("sel"));
  ejemploSel = null;
  imagenDataUrl = await comprimir(blob);
  thumbSel = await comprimir(blob, 480, 0.7); // copia pequeña para guardar en el historial
  $("m-prev").src = thumbSel;
  $("m-prev").classList.remove("hidden");
  $("m-run").disabled = !loteActivo();
}

$("m-pick").onclick = () => $("m-file").click();
$("m-file").onchange = (e) => { if (e.target.files[0]) usarFoto(e.target.files[0]); e.target.value = ""; };
$("m-file-cam").onchange = (e) => { if (e.target.files[0]) usarFoto(e.target.files[0]); e.target.value = ""; };

// Cámara: webcam en PC / cámara trasera en celular. Si el navegador no lo permite, abre la cámara nativa.
let camStream = null;
$("m-cam").onclick = async () => {
  if (!navigator.mediaDevices?.getUserMedia) return $("m-file-cam").click();
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false });
    $("cam-video").srcObject = camStream;
    $("cam-box").classList.remove("hidden");
    $("m-msg").textContent = "";
  } catch (e) {
    $("m-msg").textContent = "⚠ No se pudo abrir la cámara (" + (e.name === "NotAllowedError" ? "permiso denegado" : e.message) + "). Usa Seleccionar archivo.";
  }
};
function cerrarCamara() {
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = null;
  $("cam-box").classList.add("hidden");
}
$("cam-close").onclick = cerrarCamara;
$("cam-shot").onclick = () => {
  const v = $("cam-video");
  if (!v.videoWidth) return;
  const c = document.createElement("canvas");
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  c.toBlob((blob) => { cerrarCamara(); usarFoto(blob); }, "image/jpeg", 0.9);
};

// Reduce la imagen (máx. 1600 px) para no superar el límite de 4.5 MB de Vercel
function comprimir(blob, max = 1600, q = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * k; c.height = img.height * k;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", q));
    };
    img.src = URL.createObjectURL(blob);
  });
}

$("m-run").onclick = async () => {
  const l = loteActivo();
  if (!l || !imagenDataUrl) return;
  $("m-run").disabled = true;
  $("m-msg").textContent = "Analizando muestra…";
  try {
    const r = await fetch("/api/analizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagen: imagenDataUrl, ejemplo: ejemploSel, maxQuebrados: l.config.maxQuebrados, maxTizosos: l.config.maxTizosos }),
    });
    const res = await r.json();
    if (!r.ok) throw new Error(res.error || "Error en el análisis");
    if (!res.esArroz) throw new Error("La imagen no parece una muestra de arroz. " + (res.observacion || ""));

    // La muestra se registra en la siguiente toma programada (último + intervalo); si no hay, ahora.
    const prev = l.muestras.at(-1);
    const now = prev ? new Date(new Date(prev.fecha).getTime() + l.config.intervalo * 60000) : new Date();
    const hora = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const id = "M-" + String(l.muestras.length + 1).padStart(3, "0");
    const m = { id, fecha: now.toISOString(), hora, imagen: thumbSel, ...res };
    l.muestras.push(m);
    res.alertas.forEach((txt, k) => l.alertas.push({ id: `${l.id}-${id}-${k}-${Date.now()}`, muestra: id, hora, txt, estado: "Generada", cierre: null }));
    save();

    $("m-msg").textContent = res.modo === "demo" ? "Analizado en modo demo (sin API key)." : "Analizado con OpenAI.";
    $("m-prev").classList.add("hidden");
    if (res.alertas.length) beep();
    pintarMonitoreo();
    mostrarDetalle(m, l);
  } catch (e) {
    $("m-msg").textContent = "⚠ " + e.message;
  } finally {
    $("m-run").disabled = false;
  }
};

function mostrarDetalle(m, l) {
  const w = (n) => (n / m.total) * 100;
  $("m-det").classList.remove("hidden");
  $("m-det").innerHTML = `
    <img src="${m.imagen}" alt="${m.id}">
    <div>
      <h3>${m.id} · ${m.hora} <span class="pill ${m.estado === "OK" ? "ok" : "red"}">${m.estado}</span></h3>
      <div class="bar"><span style="width:${w(m.enteros)}%;background:#1f6b52"></span><span style="width:${w(m.quebrados)}%;background:#a33a2c"></span><span style="width:${w(m.tizosos)}%;background:#c98a00"></span></div>
      <p>${m.total} granos · <b style="color:#1f6b52">${m.enteros} enteros</b> · <b style="color:#a33a2c">${m.quebrados} quebrados (${fmt(m.pctQuebrados)})</b> · <b style="color:#c98a00">${m.tizosos} tizosos (${fmt(m.pctTizosos)})</b></p>
      <p class="muted">Límites del lote: ${l.config.maxQuebrados} % / ${l.config.maxTizosos} % · Confianza ${m.confianza}<br>${m.observacion}</p>
    </div>`;
}

function pintarMonitoreo() {
  const l = loteActivo();
  if (!l) {
    $("m-sub").textContent = "No hay un lote en proceso. Ve a Configurar lote para iniciar uno.";
    $("m-estado").textContent = "Sin lote"; $("m-estado").className = "pill warn";
    ["m-ult", "m-int", "m-prox", "m-n", "k-q", "k-t"].forEach((id) => ($(id).textContent = "–"));
    $("g-q").innerHTML = $("g-t").innerHTML = ""; $("m-alerts").innerHTML = ""; $("m-tabla").innerHTML = "";
    $("m-run").disabled = true; $("m-fin").disabled = true;
    return;
  }
  $("m-estado").textContent = "En proceso"; $("m-estado").className = "pill ok"; $("m-fin").disabled = false;
  $("m-sub").textContent = `Lote ${l.id} · ${l.variedad} · Calidad objetivo ${l.calidad} · Productor ${l.productor}`;
  $("m-run").disabled = !imagenDataUrl;

  const ult = l.muestras.at(-1);
  $("m-ult").textContent = ult ? `${ult.id} · ${ult.hora}` : "–";
  $("m-int").textContent = `${l.config.intervalo} min`;
  $("m-prox").textContent = ult ? sumarMin(ult.hora, l.config.intervalo) : "Ahora";
  $("m-n").textContent = l.muestras.length;

  kpi("k-q", "k-ql", ult?.pctQuebrados, l.config.maxQuebrados);
  kpi("k-t", "k-tl", ult?.pctTizosos, l.config.maxTizosos);
  grafico("g-q", l.muestras, "pctQuebrados", l.config.maxQuebrados);
  grafico("g-t", l.muestras, "pctTizosos", l.config.maxTizosos);

  $("m-alerts").innerHTML = l.alertas.length
    ? l.alertas.slice().reverse().map((a) => `
      <div class="alert">
        <div><b>${a.hora} · ${a.txt}</b><br><small class="muted">Muestra ${a.muestra}${a.cierre ? " · " + a.cierre : ""}</small></div>
        <div><span class="pill ${a.estado === "Cerrada" ? "ok" : "warn"}">${a.estado}</span>
        ${a.estado !== "Cerrada" ? `<button class="btn sm" onclick="atender('${a.id}')">Atender alerta</button>` : ""}</div>
      </div>`).join("")
    : '<p class="muted">Sin alertas.</p>';

  $("m-tabla").innerHTML = filasMuestras(l.muestras.slice().reverse());
}

function filasMuestras(ms) {
  return ms.map((m) => `
    <tr><td><img class="thumb" src="${m.imagen}" onclick="verFoto('${m.imagen}','${m.id} · ${m.total} granos · ${m.enteros} enteros, ${m.quebrados} quebrados, ${m.tizosos} tizosos')" alt="${m.id}"></td>
    <td>${m.id}</td><td>${m.hora}</td><td>${m.total}</td><td>${fmt(m.pctQuebrados)}</td><td>${fmt(m.pctTizosos)}</td>
    <td><span class="pill ${m.estado === "OK" ? "ok" : "red"}">${m.estado}</span></td></tr>`).join("");
}

$("m-fin").onclick = () => {
  const l = loteActivo();
  if (!l) return;
  const abiertas = l.alertas.filter((a) => a.estado !== "Cerrada").length;
  if (!confirm(`¿Finalizar el lote ${l.id}?${abiertas ? ` Tiene ${abiertas} alerta(s) sin cerrar.` : ""}`)) return;
  l.estado = "Finalizado"; DB.activo = null; save(); pintarMonitoreo();
};

const sumarMin = (hhmm, min) => {
  const [h, m] = hhmm.split(":").map(Number), t = (h * 60 + m + min) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

function kpi(idV, idL, v, lim) {
  $(idV).textContent = fmt(v);
  $(idV).classList.toggle("over", v != null && v > lim);
  $(idL).textContent = `Límite ${lim} %`;
}

// Gráfico SVG de línea con la tolerancia como línea punteada
function grafico(id, muestras, campo, lim) {
  const vals = muestras.map((m) => m[campo]);
  if (!vals.length) return ($(id).innerHTML = `<text x="160" y="60" text-anchor="middle">Sin muestras</text>`);
  const W = 320, H = 120, L = 26, R = 8, T = 8, B = 20;
  const max = Math.ceil(Math.max(lim * 1.4, ...vals) / 2) * 2;
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const x = (i) => (vals.length < 2 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (vals.length - 1));
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  $(id).innerHTML = `
    <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#d6e0db"/>
    <text x="${L - 4}" y="${y(0) + 3}" text-anchor="end">0</text>
    <text x="${L - 4}" y="${y(max) + 3}" text-anchor="end">${max}</text>
    <line x1="${L}" x2="${W - R}" y1="${y(lim)}" y2="${y(lim)}" stroke="#c98a00" stroke-dasharray="5 4"/>
    <polyline points="${pts}" fill="none" stroke="#1f6b52" stroke-width="2"/>
    ${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${v > lim ? "#a33a2c" : "#1f6b52"}"><title>${muestras[i].id} ${muestras[i].hora}: ${fmt(v)}</title></circle>`).join("")}
    <text x="${L}" y="${H - 4}">${muestras[0].hora}</text>
    <text x="${W - R}" y="${H - 4}" text-anchor="end">${muestras.at(-1).hora}</text>`;
}

function beep() {
  try {
    const ctx = new AudioContext(), o = ctx.createOscillator();
    o.connect(ctx.destination); o.frequency.value = 880; o.start(); o.stop(ctx.currentTime + 0.4);
  } catch {}
}

// ---------- Atender alerta (CU-06) ----------
window.atender = (alertaId) => {
  const l = loteActivo(), a = l.alertas.find((x) => x.id === alertaId);
  a.estado = "En atención"; save(); pintarMonitoreo();
  $("d-txt").textContent = `${a.txt} · Lote ${l.id} · Muestra ${a.muestra} · ${a.hora}`;
  $("d-desc").value = "";
  $("dlg").showModal();
  $("dlg").onclose = () => {
    if ($("dlg").returnValue !== "ok") return;
    a.estado = "Cerrada";
    a.cierre = $("d-cal").value === "si" ? `Calibración: ${$("d-maq").value} — ${$("d-desc").value || "sin detalle"}` : "Sin calibración";
    save(); pintarMonitoreo();
  };
};

window.verFoto = (src, txt) => { $("foto-img").src = src; $("foto-txt").textContent = txt; $("foto").showModal(); };

// ---------- Historial (CU-02) ----------
function lotesVisibles() {
  const conDatos = DB.lotes.filter((l) => l.muestras.length);
  return DB.sesion.rol === "Productor" ? conDatos.filter((l) => l.productor === PRODUCTOR_DEMO) : conDatos;
}
function iniciarHistorial() {
  const ls = lotesVisibles();
  const opts = (vals) => `<option value="">Todos</option>` + [...new Set(vals)].sort().map((v) => `<option>${v}</option>`).join("");
  $("f-var").innerHTML = opts(ls.map((l) => l.variedad));
  $("f-prod").innerHTML = opts(ls.map((l) => l.productor));
  $("f-lote").innerHTML = opts(ls.map((l) => l.id));
  $("f-prod-w").classList.toggle("hidden", DB.sesion.rol === "Productor");
  $("h-det").classList.add("hidden");
  pintarHistorial();
}
$("f-btn").onclick = pintarHistorial;

function pintarHistorial() {
  const ini = $("f-ini").value, fin = $("f-fin").value;
  if (ini && fin && fin < ini) return ($("f-err").textContent = "La fecha final no puede ser anterior a la fecha inicial.");
  $("f-err").textContent = "";
  const inc = $("f-inc").value;
  const lotes = lotesVisibles().filter((l) =>
    (!ini || l.fecha >= ini) && (!fin || l.fecha <= fin) &&
    (!$("f-var").value || l.variedad === $("f-var").value) &&
    (!$("f-prod").value || l.productor === $("f-prod").value) &&
    (!$("f-lote").value || l.id === $("f-lote").value) &&
    (inc === "" || (inc === "3" ? l.alertas.length >= 3 : l.alertas.length === Number(inc)))
  ).sort((a, b) => b.fecha.localeCompare(a.fecha));

  const todas = lotes.flatMap((l) => l.muestras);
  const nAl = lotes.reduce((s, l) => s + l.alertas.length, 0);
  $("h-kpis").innerHTML = [
    ["Lotes", lotes.length], ["Muestras", todas.length],
    ["% Quebrados prom.", fmt(prom(todas, "pctQuebrados"))], ["% Tizosos prom.", fmt(prom(todas, "pctTizosos"))], ["Alertas emitidas", nAl],
  ].map(([t, v]) => `<div class="card"><small class="muted">${t}</small><b>${v}</b></div>`).join("");

  $("h-body").innerHTML = lotes.map((l) => `
    <tr id="row-${l.id}"><td><b>${l.id}</b></td><td>${fechaCorta(l.fecha)}</td><td>${l.variedad}</td><td>${l.productor}</td><td>${l.muestras.length}</td>
    <td>${fmt(prom(l.muestras, "pctQuebrados"))}</td><td>${fmt(prom(l.muestras, "pctTizosos"))}</td><td>${l.alertas.length}</td>
    <td><button class="link" onclick="detalleLote('${l.id}')">Ver detalle</button><button class="link" onclick="exportarCSV('${l.id}')">Excel</button><button class="link" onclick="exportarPDF('${l.id}')">PDF</button></td></tr>`).join("");
  $("h-msg").textContent = lotes.length ? "" : "No existen evaluaciones para los criterios ingresados.";
  $("h-det").classList.add("hidden");
}

window.detalleLote = (id) => {
  const l = DB.lotes.find((x) => x.id === id);
  document.querySelectorAll("#h-body tr").forEach((tr) => tr.classList.toggle("sel", tr.id === "row-" + id));
  const atendidas = l.alertas.filter((a) => a.estado === "Cerrada").length;
  $("h-det").classList.remove("hidden");
  $("h-det").innerHTML = `
    <div class="foot"><h2 style="margin:0">Reporte de calidad · Lote ${l.id}</h2>
      <div class="noprint"><button class="btn ghost sm" onclick="exportarCSV('${l.id}')">Descargar Excel</button> <button class="btn sm" onclick="window.print()">Descargar PDF</button></div></div>
    <p class="muted">${l.variedad} · Calidad ${l.calidad} · Productor ${l.productor} · ${fechaCorta(l.fecha)} · Estado: ${l.estado}<br>
      Límites: quebrados ${l.config.maxQuebrados} %, tizosos ${l.config.maxTizosos} % · Muestreo cada ${l.config.intervalo} min · Responsable ${l.config.responsable}</p>
    <div class="grid4">
      ${[["Muestras", l.muestras.length], ["% Quebrados prom.", fmt(prom(l.muestras, "pctQuebrados"))], ["% Tizosos prom.", fmt(prom(l.muestras, "pctTizosos"))], ["Alertas atendidas", `${atendidas} / ${l.alertas.length}`]]
        .map(([t, v]) => `<div class="card"><small class="muted">${t}</small><b>${v}</b></div>`).join("")}
    </div>
    <div class="grid2" style="margin-top:12px">
      <div class="card"><h3>Quebrados por muestra</h3><svg id="hd-q" class="chart" viewBox="0 0 320 120"></svg></div>
      <div class="card"><h3>Tizosos por muestra</h3><svg id="hd-t" class="chart" viewBox="0 0 320 120"></svg></div>
    </div>
    <h3 style="margin-top:16px">Evaluaciones por muestra</h3>
    <div class="scroll"><table><thead><tr><th>Foto</th><th>Muestra</th><th>Hora</th><th>Granos</th><th>% Queb.</th><th>% Tiz.</th><th>Estado</th></tr></thead>
    <tbody>${filasMuestras(l.muestras)}</tbody></table></div>
    <h3 style="margin-top:16px">Alertas</h3>
    ${l.alertas.length ? l.alertas.map((a) => `<div class="alert"><div><b>${a.hora} · ${a.txt}</b><br><small class="muted">Muestra ${a.muestra}${a.cierre ? " · " + a.cierre : ""}</small></div><span class="pill ${a.estado === "Cerrada" ? "ok" : "warn"}">${a.estado}</span></div>`).join("") : '<p class="muted">Sin alertas.</p>'}`;
  grafico("hd-q", l.muestras, "pctQuebrados", l.config.maxQuebrados);
  grafico("hd-t", l.muestras, "pctTizosos", l.config.maxTizosos);
  $("h-det").scrollIntoView({ behavior: "smooth" });
};

// ---------- Exportación (CU-03) ----------
function validarReporte(l) {
  if (l.muestras.length < MIN_MUESTRAS_REPORTE) {
    alert(`No se puede generar el consolidado: el lote ${l.id} tiene ${l.muestras.length} muestra(s) y se requieren al menos ${MIN_MUESTRAS_REPORTE}.`);
    return false;
  }
  return true;
}
window.exportarCSV = (id) => {
  const l = DB.lotes.find((x) => x.id === id);
  if (!validarReporte(l)) return;
  const filas = [
    ["Lote", l.id, "Variedad", l.variedad, "Productor", l.productor],
    ["% quebrados promedio", prom(l.muestras, "pctQuebrados").toFixed(1), "% tizosos promedio", prom(l.muestras, "pctTizosos").toFixed(1), "Alertas atendidas", l.alertas.filter((a) => a.estado === "Cerrada").length],
    [],
    ["muestra", "fecha", "hora", "total", "enteros", "quebrados", "tizosos", "pct_quebrados", "pct_tizosos", "estado"],
    ...l.muestras.map((m) => [m.id, m.fecha.slice(0, 10), m.hora, m.total, m.enteros, m.quebrados, m.tizosos, m.pctQuebrados, m.pctTizosos, m.estado]),
  ];
  const blob = new Blob(["﻿" + filas.map((f) => f.join(";")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `reporte_${l.id}.csv`; a.click();
};
window.exportarPDF = (id) => {
  const l = DB.lotes.find((x) => x.id === id);
  if (!validarReporte(l)) return;
  detalleLote(id);
  setTimeout(() => window.print(), 300);
};

cargar().then(entrar);
