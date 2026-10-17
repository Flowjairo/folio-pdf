import * as pdfjsLib from "/vendor/pdf.mjs";
window.pdfjsLib = pdfjsLib;

(function () {
  "use strict";

  pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.mjs";
  var FONT_URL = "/vendor/standard_fonts/";
  var WASM_URL = "/vendor/corregir/qpdf.wasm";

  var $ = function (id) { return document.getElementById(id); };
  var landing = $("landing"), app = $("app"), picker = $("picker"), dropzone = $("dropzone"), pickBtn = $("pickBtn");
  var navPick = $("navPick"), menuPick = $("menuPick"), burger = $("burger"), menu = $("menu");
  var backBtn = $("backBtn"), fnameEl = $("fname"), fmetaEl = $("fmeta"), chip = $("chip");
  var tabEdit = $("tab-edit"), tabLock = $("tab-lock"), editCount = $("editCount"), dlBtn = $("dlBtn"), dlLabel = $("dlLabel");
  var busyBox = $("busy"), busyText = $("busyText");
  var notice = $("notice"), noticeTitle = $("noticeTitle"), noticeText = $("noticeText"), noticeBtn = $("noticeBtn");
  var gate = $("gate"), gateForm = $("gateForm"), gatePw = $("gatePw"), gateEye = $("gateEye"), gateErr = $("gateErr"), gateBtn = $("gateBtn"), gateLabel = $("gateLabel");
  var editView = $("editView"), lockView = $("lockView");
  var viewer = $("viewer"), stage = $("stage"), canvas = $("canvas"), layer = $("layer");
  var prevBtn = $("prevBtn"), nextBtn = $("nextBtn"), pageLabel = $("pageLabel");
  var undoBtn = $("undoBtn"), hintText = $("hintText"), rotWarn = $("rotWarn"), noTextNote = $("noTextNote");
  var sizePick = $("sizePick"), sizeSel = $("sizeSel");
  var changesList = $("changesList"), changesEmpty = $("changesEmpty"), changesCount = $("changesCount");
  var lockIco = $("lockIco"), lockTitle = $("lockTitle"), lockNote = $("lockNote"), lockActions = $("lockActions"), lockErr = $("lockErr");
  var modal = $("modal"), modalTitle = $("modalTitle"), modalText = $("modalText"), modalName = $("modalName");
  var modalDl = $("modalDl"), modalDlLabel = $("modalDlLabel"), modalNote = $("modalNote"), modalClose = $("modalClose"), modalBack = $("modalBack");
  var toastEl = $("toast"), seg = $("seg"), segInd = $("segInd"), modalShell = $("modalShell"), modalCard = $("modalCard");
  var editSeq = 0, seenIds = {}, modalTimer = null;
  var ctx = canvas.getContext("2d", { willReadFrequently: true });

  var ICON = {
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>',
    unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 7.8-1.2"></path></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"></path><path d="M8 7h9v9"></path></svg>'
  };

  function freshState() {
    return {
      name: "", origBytes: null, workBytes: null,
      protection: null, origProtection: null, suffix: "",
      pdf: null, page: 1, pages: 0, vp: null, scale: 1, dpr: 1, items: [], rotated: false,
      edits: [], tool: "edit", intent: "edit", tab: "edit"
    };
  }
  var S = freshState();
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var MODE = (new URLSearchParams(location.search).get("modo") === "contrasena") ? "lock" : "edit";
  var pendingIntent = MODE;
  var activeInline = null;
  var resultBytes = null, resultFile = "";

  /* ================= qpdf ================= */

  var wasmBinary = null;
  function loadWasm() {
    if (wasmBinary) return Promise.resolve(wasmBinary);
    return fetch(WASM_URL).then(function (r) {
      if (!r.ok) throw new Error("No se pudo cargar el motor de contraseñas (" + r.status + ").");
      return r.arrayBuffer();
    }).then(function (b) { wasmBinary = b; return b; });
  }
  function qpdf(args, inputBytes) {
    return loadWasm().then(function (buf) {
      return Module({ wasmBinary: new Uint8Array(buf.slice(0)), locateFile: function () { return WASM_URL; } });
    }).then(function (mod) {
      if (inputBytes) mod.FS.writeFile("/in.pdf", inputBytes);
      var code = 0;
      try { code = mod.callMain(args); }
      catch (e) { code = (e && typeof e.status === "number") ? e.status : -1; }
      var out = null;
      try { out = mod.FS.readFile("/out.pdf"); } catch (e) { out = null; }
      return { code: code, out: out };
    });
  }

  /* ================= utilidades ================= */

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function bytesLabel(n) { return n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
  function baseName(n) { return n.replace(/\.pdf$/i, ""); }
  function outName() { return baseName(S.name) + (S.suffix || "") + ".pdf"; }
  function hex(r, g, b) { return "#" + [r, g, b].map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join(""); }
  function rgbOf(h) { return PDFLib.rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255); }
  function winAnsi(s) {
    return s.replace(/[^\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, "");
  }
  function busy(on, text) { busyBox.hidden = !on; if (text) busyText.textContent = text; }
  // Aviso flotante: si llega otro mientras se ve, cambia el texto sin volver a entrar.
  // El temporizador se pausa cuando la pestaña está oculta.
  var toastTimer = null, toastHideTimer = null, toastLeft = 0, toastStart = 0;
  function toastSchedule(ms) {
    clearTimeout(toastTimer);
    toastLeft = ms; toastStart = Date.now();
    toastTimer = setTimeout(function () {
      toastEl.classList.add("out");
      toastHideTimer = setTimeout(function () { toastEl.hidden = true; toastEl.classList.remove("out"); }, 220);
    }, ms);
  }
  function toast(msg, kind) {
    clearTimeout(toastHideTimer);
    toastEl.textContent = msg;
    toastEl.classList.toggle("err", kind === "err");
    toastEl.classList.remove("out");
    toastEl.hidden = false;
    toastSchedule(4200);
  }
  document.addEventListener("visibilitychange", function () {
    if (toastEl.hidden || toastEl.classList.contains("out")) return;
    if (document.hidden) { clearTimeout(toastTimer); toastLeft = Math.max(1200, toastLeft - (Date.now() - toastStart)); }
    else toastSchedule(toastLeft);
  });
  function setChip(kind, text) { chip.hidden = false; chip.className = "chip " + kind; chip.textContent = text; }
  function errMsg(e) { return e && e.message ? e.message : String(e); }

  function ctaButton(label, extra) {
    var b = el("button", "cta" + (extra ? " " + extra : ""));
    var l = el("span", null, label);
    var orb = el("span", "orb");
    orb.innerHTML = ICON.arrow;
    b.appendChild(l); b.appendChild(orb);
    return b;
  }

  function passwordField(id, labelText, hintText) {
    var wrap = el("div", "field"), lab = el("label", null, labelText);
    lab.setAttribute("for", id);
    var row = el("div", "pw"), input = document.createElement("input");
    input.type = "password"; input.id = id; input.autocomplete = "new-password"; input.spellcheck = false;
    var eye = el("button", "eye", "Ver"); eye.type = "button";
    eye.setAttribute("aria-label", "Mostrar u ocultar la contraseña");
    eye.addEventListener("click", function () {
      var hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      eye.textContent = hidden ? "Ocultar" : "Ver";
      input.focus();
    });
    row.appendChild(input); row.appendChild(eye);
    wrap.appendChild(lab); wrap.appendChild(row);
    if (hintText) wrap.appendChild(el("p", "fine", hintText));
    return { wrap: wrap, input: input };
  }

  /* ================= entrada del archivo ================= */

  function resetWork() {
    closeInline(false);
    if (S.pdf) { try { (S.pdf.loadingTask || S.pdf).destroy(); } catch (e) {} }
    S = freshState();
    layer.innerHTML = "";
    canvas.width = 0; canvas.height = 0;
    stage.style.width = ""; stage.style.height = "";
    notice.hidden = true; gate.hidden = true; editView.hidden = true; lockView.hidden = true;
    gateErr.hidden = true; gatePw.value = ""; gatePw.type = "password"; gateEye.textContent = "Ver";
    chip.hidden = true; busy(false); closeModal();
    picker.value = "";
    setTool("edit");
    renderChanges();
  }

  function setWorkEnabled(on) { tabEdit.disabled = !on; tabLock.disabled = !on; dlBtn.disabled = !on; }

  function handleFile(file) {
    if (!file) return;
    if (!authSession) { goLogin(); return; }
    var intent = pendingIntent; pendingIntent = MODE;
    closeMenu();
    resetWork();
    S.intent = intent; S.name = file.name;
    landing.hidden = true; app.hidden = false;
    window.scrollTo(0, 0);
    fnameEl.textContent = file.name;
    fmetaEl.textContent = bytesLabel(file.size);
    setWorkEnabled(false);
    busy(true, "Revisando tu archivo…");

    file.arrayBuffer().then(function (buf) {
      S.origBytes = new Uint8Array(buf);
      var magic = String.fromCharCode.apply(null, S.origBytes.subarray(0, 5));
      if (magic !== "%PDF-") {
        busy(false);
        showNotice("Esto no parece un PDF", "Revisa que el archivo no sea una imagen o un documento de Word con el nombre cambiado, y vuelve a intentarlo.");
        return;
      }
      return analyze();
    }).catch(function (e) {
      busy(false);
      showNotice("No pudimos abrir el archivo", errMsg(e));
    });
  }

  function showNotice(title, text) {
    noticeTitle.textContent = title;
    noticeText.textContent = text;
    notice.hidden = false;
  }

  function analyze() {
    return qpdf(["--is-encrypted", "/in.pdf"], S.origBytes).then(function (r) {
      if (r.code !== 0 && r.code !== 2) throw new Error("qpdf respondió con código " + r.code);
      if (r.code === 0) {
        return qpdf(["--decrypt", "/in.pdf", "/out.pdf"], S.origBytes).then(function (d) {
          S.protection = "permisos";
          S.workBytes = d.out || S.origBytes;
        });
      }
      return qpdf(["--decrypt", "/in.pdf", "/out.pdf"], S.origBytes).then(function (d) {
        if (d.code === 0) { S.protection = "abierto"; S.workBytes = S.origBytes; }
        else { S.protection = "clave"; S.workBytes = null; }
      });
    }).catch(fallbackAnalyze).then(function () {
      busy(false);
      S.origProtection = S.protection;
      if (S.protection === "cifrado") {
        setChip("lock", "Protegido");
        showNotice("Este PDF está protegido", "Para editarlo hay que quitarle la protección primero, y el componente de contraseñas no pudo cargarse en este navegador. Prueba en Chrome o Edge actualizados. Detalle técnico: " + S.qpdfError);
        return;
      }
      if (S.protection === "clave") {
        setChip("lock", "Pide contraseña");
        gate.hidden = false;
        setTimeout(function () { gatePw.focus(); }, 60);
      } else {
        if (S.protection === "permisos") setChip("warn", "Con restricciones");
        else setChip("ok", "Sin contraseña");
        openWork();
      }
    });
  }

  // Si el componente de contraseñas (qpdf) no carga, el editor debe seguir funcionando con los PDF sin protección.
  function fallbackAnalyze(err) {
    S.noQpdf = true;
    S.qpdfError = errMsg(err);
    if (window.console) console.warn("Folio PDF: qpdf no disponible —", S.qpdfError);
    if (!window.PDFLib) { S.protection = "abierto"; S.workBytes = S.origBytes; return; }
    return PDFLib.PDFDocument.load(S.origBytes.slice(0), { updateMetadata: false }).then(function () {
      S.protection = "abierto"; S.workBytes = S.origBytes;
    }, function (e) {
      if (/encrypt/i.test(errMsg(e))) { S.protection = "cifrado"; S.workBytes = null; }
      else { S.protection = "abierto"; S.workBytes = S.origBytes; }
    });
  }

  gateEye.addEventListener("click", function () {
    var hidden = gatePw.type === "password";
    gatePw.type = hidden ? "text" : "password";
    gateEye.textContent = hidden ? "Ocultar" : "Ver";
    gatePw.focus();
  });

  gateForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var pw = gatePw.value;
    if (!pw) { gateErr.hidden = false; gateErr.textContent = "Escribe la contraseña del PDF."; gatePw.focus(); return; }
    gateErr.hidden = true; gateBtn.disabled = true; gateLabel.textContent = "Comprobando…";
    qpdf(["--password=" + pw, "--decrypt", "/in.pdf", "/out.pdf"], S.origBytes).then(function (r) {
      gateBtn.disabled = false; gateLabel.textContent = "Abrir PDF";
      if (r.code !== 0 || !r.out) {
        gateErr.hidden = false;
        gateErr.textContent = "Esa contraseña no abre el archivo. Revisa mayúsculas, espacios y acentos.";
        gatePw.select();
        return;
      }
      S.workBytes = r.out;
      setChip("ok", "Desbloqueado");
      gate.hidden = true;
      openWork();
    }).catch(function (e) {
      gateBtn.disabled = false; gateLabel.textContent = "Abrir PDF";
      gateErr.hidden = false; gateErr.textContent = errMsg(e);
    });
  });

  function openWork() {
    setWorkEnabled(true);
    requestAnimationFrame(function () { moveSegInd(true); });
    renderLockPanel();
    renderChanges();
    selectTab(S.intent === "edit" ? "edit" : "lock", true);
    openPdf(S.workBytes);
  }

  /* ================= pestañas ================= */

  function selectTab(t, skipRender) {
    closeInline(true);
    S.tab = t;
    tabEdit.setAttribute("aria-selected", String(t === "edit"));
    tabLock.setAttribute("aria-selected", String(t === "lock"));
    editView.hidden = t !== "edit";
    lockView.hidden = t !== "lock";
    moveSegInd();
    if (t === "edit" && S.pdf && !skipRender) renderPage(S.page);
  }

  // Indicador de pestaña: recorta una sola pastilla con clip-path para que se deslice sin repintar el texto.
  function moveSegInd(instant) {
    var b = S.tab === "lock" ? tabLock : tabEdit;
    if (!b.offsetWidth) return;
    var L = b.offsetLeft - 4, R = seg.clientWidth - 8 - L - b.offsetWidth;
    if (instant) segInd.classList.add("instant");
    segInd.style.clipPath = "inset(0 " + Math.max(0, R) + "px 0 " + Math.max(0, L) + "px round 999px)";
    if (instant) requestAnimationFrame(function () { requestAnimationFrame(function () { segInd.classList.remove("instant"); }); });
  }
  tabEdit.addEventListener("click", function () { selectTab("edit"); });
  tabLock.addEventListener("click", function () { selectTab("lock"); });

  /* ================= visor ================= */

  function openPdf(bytes) {
    busy(true, "Abriendo el documento…");
    var old = S.pdf;
    return pdfjsLib.getDocument({ data: bytes.slice(0), standardFontDataUrl: FONT_URL, cMapUrl: "/vendor/cmaps/", cMapPacked: true, wasmUrl: "/vendor/wasm/", iccUrl: "/vendor/iccs/", isEvalSupported: false, enableXfa: false }).promise.then(function (doc) {
      busy(false);
      if (old) { try { (old.loadingTask || old).destroy(); } catch (e) {} }
      S.pdf = doc; S.pages = doc.numPages;
      if (S.page > S.pages) S.page = 1;
      updatePager();
      if (S.tab === "edit") return renderPage(S.page);
    }).catch(function (e) {
      busy(false);
      toast("No se pudo mostrar el documento: " + errMsg(e), "err");
    });
  }

  function updatePager() {
    pageLabel.textContent = "Página " + S.page + " de " + (S.pages || 1);
    prevBtn.disabled = S.page <= 1;
    nextBtn.disabled = S.page >= S.pages;
  }

  var renderSeq = 0, renderTask = null;
  function renderPage(n) {
    if (!S.pdf) return Promise.resolve();
    closeInline(true);
    var seq = ++renderSeq;
    S.page = n; updatePager();
    return S.pdf.getPage(n).then(function (page) {
      if (seq !== renderSeq) return;
      if (renderTask) { try { renderTask.cancel(); } catch (e) {} renderTask = null; }
      var avail = Math.max(240, viewer.clientWidth - 28);
      var base = page.getViewport({ scale: 1 });
      var cssScale = Math.min(avail / base.width, 1.7);
      S.scale = cssScale;
      S.dpr = Math.min(window.devicePixelRatio || 1, 2);
      var vpCss = page.getViewport({ scale: cssScale });
      var vpRen = page.getViewport({ scale: cssScale * S.dpr });
      S.vp = vpCss;
      S.rotated = (page.rotate % 360) !== 0;
      canvas.width = Math.floor(vpRen.width);
      canvas.height = Math.floor(vpRen.height);
      canvas.style.width = Math.floor(vpCss.width) + "px";
      canvas.style.height = Math.floor(vpCss.height) + "px";
      stage.style.width = Math.floor(vpCss.width) + "px";
      stage.style.height = Math.floor(vpCss.height) + "px";
      layer.innerHTML = "";
      renderTask = page.render({ canvas: canvas, canvasContext: ctx, viewport: vpRen });
      return renderTask.promise.then(function () {
        renderTask = null;
        if (seq !== renderSeq) return null;
        return page.getTextContent();
      }).then(function (tc) {
        if (!tc || seq !== renderSeq) return;
        S.items = tc.items.filter(function (it) { return it.str && it.str.trim().length && (Math.abs(it.transform[0]) > 0 || it.height > 0); });
        refreshWarnings();
        buildLayer();
      });
    }).catch(function (e) {
      if (e && e.name === "RenderingCancelledException") return;
      S.items = [];
      refreshWarnings();
      toast("No se pudo leer esta página: " + errMsg(e), "err");
    });
  }

  // Color del papel (el más frecuente) y de la tinta (el más oscuro) en una zona del lienzo.
  function sampleColors(cssX, cssY, cssW, cssH) {
    var d = S.dpr;
    var x = Math.max(0, Math.floor(cssX * d)), y = Math.max(0, Math.floor(cssY * d));
    var w = Math.min(canvas.width - x, Math.ceil(cssW * d)), h = Math.min(canvas.height - y, Math.ceil(cssH * d));
    if (w <= 0 || h <= 0) return { bg: "#ffffff", ink: "#111111" };
    var data;
    try { data = ctx.getImageData(x, y, w, h).data; } catch (e) { return { bg: "#ffffff", ink: "#111111" }; }
    var counts = {}, best = null, bestN = 0, dark = [17, 17, 17], darkL = 999;
    for (var i = 0; i < data.length; i += 4) {
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var key = (r >> 4) + "," + (g >> 4) + "," + (b >> 4);
      counts[key] = (counts[key] || 0) + 1;
      if (counts[key] > bestN) { bestN = counts[key]; best = [r, g, b]; }
      var lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < darkL) { darkL = lum; dark = [r, g, b]; }
    }
    return { bg: best ? hex(best[0], best[1], best[2]) : "#ffffff", ink: hex(dark[0], dark[1], dark[2]) };
  }

  function refreshWarnings() {
    var editing = S.tool === "edit" && !!S.vp;
    rotWarn.hidden = !(editing && S.rotated);
    noTextNote.hidden = !(editing && !S.rotated && S.items.length === 0);
  }

  function boxOf(ed) {
    if (ed.rect) {
      var a = S.vp.convertToViewportPoint(ed.rect.x, ed.rect.y);
      var b = S.vp.convertToViewportPoint(ed.rect.x + ed.rect.w, ed.rect.y + ed.rect.h);
      return { l: Math.min(a[0], b[0]), t: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
    }
    var p = S.vp.convertToViewportPoint(ed.x, ed.y), fs = ed.size * S.scale;
    return { l: p[0], t: p[1] - fs * 0.85, w: null, h: null };
  }

  function buildLayer() {
    if (!S.vp) return;
    layer.innerHTML = "";
    var s = S.scale;
    var editedKeys = {};

    S.edits.forEach(function (ed) {
      if (ed.page !== S.page) return;
      if (ed.key) editedKeys[ed.key] = true;
      var b = boxOf(ed);
      var wrap = el("div", "ov-wrap");
      wrap.style.left = b.l + "px"; wrap.style.top = b.t + "px";
      if (b.w != null) { wrap.style.width = b.w + "px"; wrap.style.height = b.h + "px"; }
      if (ed.rect) {
        var box = el("div", "ov-box");
        box.style.background = ed.bg;
        wrap.appendChild(box);
      }
      if (ed.text) {
        var fs = ed.size * s;
        var t = el("div", "ov-text", winAnsi(ed.text));
        t.style.fontSize = fs + "px";
        t.style.color = ed.ink;
        if (ed.rect) {
          var p = S.vp.convertToViewportPoint(ed.x, ed.y);
          t.style.left = (p[0] - b.l) + "px";
          t.style.top = (p[1] - fs * 0.85 - b.t) + "px";
        } else {
          t.style.position = "relative";
        }
        wrap.appendChild(t);
      }
      var del = el("button", "ov-del", "×");
      del.type = "button";
      del.setAttribute("aria-label", "Quitar este cambio");
      del.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        S.edits.splice(S.edits.indexOf(ed), 1);
        afterEditsChange();
      });
      wrap.appendChild(del);
      if (ed.text && S.tool === "edit") {
        wrap.addEventListener("click", function () { reopenEdit(ed); });
      }
      layer.appendChild(wrap);
    });

    if (S.tool !== "edit" || S.rotated) return;
    S.items.forEach(function (it, idx) {
      var key = S.page + ":" + idx;
      if (editedKeys[key]) return;
      var fs = Math.abs(it.transform[0]) || it.height || 10;
      var p = S.vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      var h = Math.max(it.height, fs) * s;
      var w = Math.max(it.width * s, 10);
      var hot = el("div", "hot");
      hot.tabIndex = 0;
      hot.setAttribute("role", "button");
      hot.setAttribute("aria-label", "Corregir: " + it.str);
      hot.style.left = (p[0] - 2) + "px";
      hot.style.top = (p[1] - h * 0.92) + "px";
      hot.style.width = (w + 4) + "px";
      hot.style.height = (h * 1.2) + "px";
      var open = function () {
        openInline({
          x: it.transform[4], y: it.transform[5], size: fs, value: it.str, select: true, label: "Corregir línea",
          onCommit: function (v) {
            if (v !== it.str) {
              var cols = sampleColors(p[0] - 1, p[1] - h - 1, w + 2, h * 1.3 + 2);
              S.edits.push({ id: ++editSeq,
                type: "replace", key: key, page: S.page,
                rect: { x: it.transform[4] - 1, y: it.transform[5] - fs * 0.26, w: it.width + 2, h: fs * 1.3 },
                x: it.transform[4], y: it.transform[5], size: fs, text: v, orig: it.str,
                bg: cols.bg, ink: cols.ink
              });
            }
            afterEditsChange();
          }
        });
      };
      hot.addEventListener("click", open);
      hot.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      layer.appendChild(hot);
    });
  }

  function reopenEdit(ed) {
    openInline({
      x: ed.x, y: ed.y, size: ed.size, value: ed.text, select: true, label: "Editar texto",
      onCommit: function (v) {
        if ((ed.type === "replace" && v === ed.orig) || (ed.type === "add" && !v.trim())) {
          S.edits.splice(S.edits.indexOf(ed), 1);
        } else {
          ed.text = v;
        }
        afterEditsChange();
      }
    });
  }

  function openInline(o) {
    closeInline(true);
    var s = S.scale, p = S.vp.convertToViewportPoint(o.x, o.y);
    var fs = Math.max(o.size * s, 13);
    var input = document.createElement("input");
    input.type = "text";
    input.className = "inline-edit";
    input.value = o.value || "";
    input.setAttribute("aria-label", o.label || "Texto");
    if (o.placeholder) input.placeholder = o.placeholder;
    input.style.fontSize = fs + "px";
    var layerW = layer.clientWidth;
    var sizeTo = function () {
      var want = Math.max(150, (input.value.length + 3) * fs * 0.56);
      var left = Math.max(0, Math.min(p[0] - 7, layerW - Math.min(want, layerW)));
      input.style.left = left + "px";
      input.style.width = Math.min(want, layerW - left) + "px";
    };
    sizeTo();
    input.style.top = Math.max(0, p[1] - fs * 1.08 - 5) + "px";
    layer.appendChild(input);

    var done = false;
    function finish(save) {
      if (done) return;
      done = true;
      activeInline = null;
      var v = input.value;
      input.remove();
      if (save) o.onCommit(v);
      else buildLayer();
    }
    activeInline = { finish: finish };
    input.addEventListener("input", sizeTo);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", function () { finish(true); });
    input.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    // Foco y selección inmediatos: si se difieren, quien escribe rápido pierde las primeras letras.
    input.focus({ preventScroll: true });
    if (o.select) input.select();
    setTimeout(function () { if (!done && document.activeElement !== input) input.focus({ preventScroll: true }); }, 0);
  }
  function closeInline(save) { if (activeInline) activeInline.finish(save); }

  /* ---- gestos sobre la página ---- */

  var drag = null;
  layer.addEventListener("pointerdown", function (e) {
    if (e.target !== layer) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (activeInline) { e.preventDefault(); closeInline(true); return; }
    var r = layer.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    if (S.tool === "add") {
      e.preventDefault();
      var size = parseInt(sizeSel.value, 10) || 12;
      var pt = S.vp.convertToPdfPoint(x, y + size * S.scale * 0.35);
      openInline({
        x: pt[0], y: pt[1], size: size, value: "", placeholder: "Escribe y pulsa Enter", label: "Texto nuevo",
        onCommit: function (v) {
          if (v.trim()) S.edits.push({ id: ++editSeq, type: "add", page: S.page, x: pt[0], y: pt[1], size: size, text: v, ink: "#1a1a1a" });
          afterEditsChange();
        }
      });
      return;
    }
    if (S.tool === "cover") {
      e.preventDefault();
      try { layer.setPointerCapture(e.pointerId); } catch (err) {}
      var m = el("div", "marquee");
      m.style.left = x + "px"; m.style.top = y + "px"; m.style.width = "0px"; m.style.height = "0px";
      layer.appendChild(m);
      drag = { x: x, y: y, box: m };
    }
  });
  layer.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var r = layer.getBoundingClientRect();
    var x = Math.max(0, Math.min(e.clientX - r.left, r.width));
    var y = Math.max(0, Math.min(e.clientY - r.top, r.height));
    drag.box.style.left = Math.min(x, drag.x) + "px";
    drag.box.style.top = Math.min(y, drag.y) + "px";
    drag.box.style.width = Math.abs(x - drag.x) + "px";
    drag.box.style.height = Math.abs(y - drag.y) + "px";
  });
  function endDrag(cancel) {
    if (!drag) return;
    var m = drag.box; drag = null;
    var L = parseFloat(m.style.left), T = parseFloat(m.style.top);
    var W = parseFloat(m.style.width), H = parseFloat(m.style.height);
    m.remove();
    if (cancel || W < 5 || H < 5) return;
    var a = S.vp.convertToPdfPoint(L, T), b = S.vp.convertToPdfPoint(L + W, T + H);
    var cols = sampleColors(L - 3, T - 4, W + 6, 3);
    S.edits.push({ id: ++editSeq,
      type: "cover", page: S.page,
      rect: { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) },
      bg: cols.bg
    });
    afterEditsChange();
  }
  layer.addEventListener("pointerup", function () { endDrag(false); });
  layer.addEventListener("pointercancel", function () { endDrag(true); });

  /* ---- herramientas ---- */

  var tools = { edit: $("t-edit"), add: $("t-add"), cover: $("t-cover") };
  var hints = {
    edit: "Las líneas subrayadas en azul se pueden corregir. Haz clic en una para cambiarla.",
    add: "Haz clic donde quieras escribir. Enter guarda, Escape cancela.",
    cover: "Arrastra para tapar una zona. Ojo: lo de debajo deja de verse pero sigue dentro del archivo, así que no sirve para esconder datos privados."
  };
  function setTool(k) {
    closeInline(true);
    S.tool = k;
    Object.keys(tools).forEach(function (j) { tools[j].setAttribute("aria-pressed", String(j === k)); });
    hintText.textContent = hints[k];
    layer.className = "layer tool-" + k;
    sizePick.hidden = k !== "add";
    refreshWarnings();
    buildLayer();
  }
  Object.keys(tools).forEach(function (k) { tools[k].addEventListener("click", function () { setTool(k); }); });

  prevBtn.addEventListener("click", function () { if (S.page > 1) renderPage(S.page - 1); });
  nextBtn.addEventListener("click", function () { if (S.page < S.pages) renderPage(S.page + 1); });
  undoBtn.addEventListener("click", function () { closeInline(false); S.edits.pop(); afterEditsChange(); });

  /* ---- lista de cambios ---- */

  function afterEditsChange() { renderChanges(); buildLayer(); }

  function renderChanges() {
    var n = S.edits.length;
    changesList.innerHTML = "";
    changesEmpty.hidden = n > 0;
    changesCount.textContent = String(n);
    editCount.hidden = n === 0;
    editCount.textContent = String(n);
    undoBtn.disabled = n === 0;
    var label = n ? "Guardar y descargar" : "Descargar";
    if (dlLabel.textContent !== label) {
      dlLabel.textContent = label;
      if (dlLabel.animate && !reduceMotion) dlLabel.animate([{ filter: "blur(2px)", opacity: 0.5 }, { filter: "blur(0)", opacity: 1 }], { duration: 200, easing: "ease-out" });
    }
    moveSegInd();
    S.edits.forEach(function (ed) {
      var li = el("li", "change");
      if (ed.id && !seenIds[ed.id]) { seenIds[ed.id] = true; li.classList.add("is-new"); }
      var meta = el("div", "c-meta");
      meta.appendChild(el("span", "c-kind", ed.type === "replace" ? "Corrección" : ed.type === "add" ? "Texto nuevo" : "Zona tapada"));
      meta.appendChild(el("span", null, "Pág. " + ed.page));
      li.appendChild(meta);
      li.appendChild(el("div", "c-text", ed.text ? ed.text : "Rectángulo del color del papel"));
      if (ed.type === "replace") li.appendChild(el("div", "c-old", ed.orig));
      var rm = el("button", "c-rm", "Quitar");
      rm.type = "button";
      rm.setAttribute("aria-label", "Quitar este cambio");
      rm.addEventListener("click", function (e) {
        e.stopPropagation();
        S.edits.splice(S.edits.indexOf(ed), 1);
        afterEditsChange();
      });
      li.appendChild(rm);
      li.addEventListener("click", function () { if (ed.page !== S.page) renderPage(ed.page); });
      changesList.appendChild(li);
    });
  }

  /* ---- generar el PDF ---- */

  function buildEdited() {
    return PDFLib.PDFDocument.load(S.workBytes.slice(0), { ignoreEncryption: true }).then(function (doc) {
      return doc.embedFont(PDFLib.StandardFonts.Helvetica).then(function (font) {
        S.edits.forEach(function (ed) {
          var page = doc.getPage(ed.page - 1);
          if (ed.rect) page.drawRectangle({ x: ed.rect.x, y: ed.rect.y, width: ed.rect.w, height: ed.rect.h, color: rgbOf(ed.bg) });
          if (ed.text) {
            var txt = winAnsi(ed.text);
            if (txt) page.drawText(txt, { x: ed.x, y: ed.y, size: ed.size, font: font, color: rgbOf(ed.ink) });
          }
        });
        return doc.save();
      });
    });
  }

  // Aplica los cambios pendientes al documento de trabajo antes de cualquier otra operación.
  function commitEdits() {
    closeInline(true);
    if (!S.edits.length) return Promise.resolve(S.workBytes);
    if (!window.PDFLib) return Promise.reject(new Error("no cargó el componente que escribe el PDF. Revisa tu conexión a internet y recarga la página."));
    busy(true, "Aplicando tus cambios…");
    return buildEdited().then(function (bytes) {
      S.workBytes = bytes;
      S.edits = [];
      S.suffix = "-editado";
      renderChanges();
      return openPdf(bytes).then(function () { return bytes; });
    });
  }

  function downloadText() {
    if (S.origProtection === "clave" && S.protection === "clave") return "Esta copia se abre sin contraseña. Si quieres protegerla, usa la pestaña Contraseña antes de descargar.";
    if (S.origProtection === "permisos") return "Esta copia ya no tiene restricciones de impresión ni de copia.";
    return "Guárdalo en tu equipo. El archivo original sigue intacto.";
  }

  dlBtn.addEventListener("click", function () {
    if (!S.workBytes) return;
    dlBtn.disabled = true;
    usarOperacion().then(function (ok) {
      if (!ok) { dlBtn.disabled = false; return; }
      return commitEdits().then(function (bytes) {
      busy(false);
      dlBtn.disabled = false;
      showResult(bytes, outName(), "Tu PDF está listo", downloadText());
      });
    }).catch(function (e) {
      busy(false);
      dlBtn.disabled = false;
      toast("No se pudo generar el PDF: " + errMsg(e), "err");
    });
  });

  // Cada descarga, cifrado o descifrado cuenta como una operación (3 gratis al día).
  function usarOperacion() {
    if (!window.FolioLimite) return Promise.resolve(true);
    return window.FolioLimite.usar();
  }
  if (window.FolioLimite) window.FolioLimite.onRestantes = function (n) {
    if (n <= 1) toast(n === 1 ? "Te queda 1 operación gratis hoy." : "Esta fue tu última operación gratis de hoy.");
  };

  /* ================= contraseña ================= */

  function addButtons(defs) {
    var row = el("div", "row");
    defs.forEach(function (d) {
      var b = d[1] === "primary" ? ctaButton(d[0]) : el("button", "pill", d[0]);
      b.type = "button";
      b.addEventListener("click", d[2]);
      row.appendChild(b);
    });
    lockActions.appendChild(row);
  }

  function renderLockPanel() {
    lockActions.innerHTML = "";
    lockErr.hidden = true;
    var p = S.protection, o = S.origProtection;
    if (S.noQpdf) {
      lockIco.className = "big-ico tone-warn"; lockIco.innerHTML = ICON.lock;
      lockTitle.textContent = "Las contraseñas no están disponibles aquí";
      lockNote.textContent = "El componente que pone y quita contraseñas no pudo cargarse en este navegador. Puedes seguir editando el texto y descargar el PDF. Para las contraseñas, prueba en Chrome o Edge actualizados.";
      lockActions.appendChild(el("p", "fine", "Detalle técnico: " + S.qpdfError));
      return;
    }
    if (p === "permisos") {
      lockIco.className = "big-ico tone-warn"; lockIco.innerHTML = ICON.lock;
      lockTitle.textContent = "Este PDF tiene restricciones";
      lockNote.textContent = "Se abre sin contraseña, pero no deja imprimir, copiar texto o anotar. Puedes quitar esas restricciones sin conocer la clave.";
      addButtons([
        ["Quitar restricciones", "primary", runDecrypt],
        ["Ponerle contraseña de apertura", "ghost", function () { showEncrypt("Proteger PDF"); }]
      ]);
    } else if (p === "clave") {
      lockIco.className = "big-ico tone-ok"; lockIco.innerHTML = ICON.unlock;
      lockTitle.textContent = "Abriste este PDF con su contraseña";
      lockNote.textContent = "Puedes quitarla para que el archivo se abra directo, o cambiarla por una nueva.";
      addButtons([
        ["Quitar la contraseña", "primary", runDecrypt],
        ["Cambiarla por otra", "ghost", function () { showEncrypt("Cambiar contraseña"); }]
      ]);
    } else {
      lockIco.className = "big-ico tone-primary"; lockIco.innerHTML = ICON.shield;
      if (o === "clave" || o === "permisos") {
        lockTitle.textContent = "Protección retirada";
        lockNote.textContent = "Esta copia ya se abre e imprime sin restricciones. Si quieres, ponle una contraseña nueva.";
      } else {
        lockTitle.textContent = "Protege tu PDF con contraseña";
        lockNote.textContent = "Solo quien conozca la contraseña podrá abrirlo. Ideal antes de enviarlo por correo o por WhatsApp.";
      }
      lockActions.appendChild(encryptForm("Proteger PDF"));
    }
  }

  function showEncrypt(label) {
    lockActions.innerHTML = "";
    lockErr.hidden = true;
    lockActions.appendChild(encryptForm(label));
    var back = el("button", "link", "Volver");
    back.type = "button";
    back.style.alignSelf = "flex-start";
    back.addEventListener("click", renderLockPanel);
    lockActions.appendChild(back);
  }

  function encryptForm(label) {
    var form = document.createElement("form");
    form.className = "stack";
    form.noValidate = true;
    var p1 = passwordField("pw-new", "Nueva contraseña", "Guárdala bien: si la olvidas, no hay forma de recuperarla.");
    var p2 = passwordField("pw-rep", "Repite la contraseña", null);
    var btn = ctaButton(label, "cta-lg cta-wide");
    btn.type = "submit";
    form.appendChild(p1.wrap); form.appendChild(p2.wrap); form.appendChild(btn);
    form.appendChild(el("p", "fine", "Cifrado AES-256. Se abre en Acrobat, Chrome, Edge, Vista Previa y en el celular."));
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var a = p1.input.value, b = p2.input.value;
      lockErr.hidden = true;
      if (!a) { lockErr.hidden = false; lockErr.textContent = "Escribe la contraseña que quieres ponerle."; p1.input.focus(); return; }
      if (a !== b) { lockErr.hidden = false; lockErr.textContent = "Las dos contraseñas no coinciden."; p2.input.select(); return; }
      btn.disabled = true;
      usarOperacion().then(function (ok) {
        if (!ok) { btn.disabled = false; return null; }
        return commitEdits();
      }).then(function (bytes) {
        if (!bytes) return null;
        busy(true, "Cifrando tu PDF…");
        return qpdf(["/in.pdf", "/out.pdf", "--encrypt", "--user-password=" + a, "--owner-password=" + a, "--bits=256", "--"], bytes);
      }).then(function (r) {
        busy(false); btn.disabled = false;
        if (!r) return;
        if (r.code !== 0 || !r.out) { lockErr.hidden = false; lockErr.textContent = "No se pudo cifrar el archivo. Puede estar dañado."; return; }
        p1.input.value = ""; p2.input.value = "";
        showResult(r.out, baseName(S.name) + "-protegido.pdf", "PDF protegido", "Quien lo reciba necesitará la contraseña para abrirlo.");
      }).catch(function (e) {
        busy(false); btn.disabled = false;
        lockErr.hidden = false; lockErr.textContent = errMsg(e);
      });
    });
    return form;
  }

  function runDecrypt() {
    lockErr.hidden = true;
    usarOperacion().then(function (ok) {
      if (!ok) return null;
      return commitEdits();
    }).then(function (bytes) {
      if (!bytes) return null;
      busy(true, "Quitando la protección…");
      return qpdf(["--decrypt", "/in.pdf", "/out.pdf"], bytes);
    }).then(function (r) {
      busy(false);
      if (!r) return;
      if (r.code !== 0 || !r.out) { lockErr.hidden = false; lockErr.textContent = "No se pudo quitar la protección de este archivo."; return; }
      S.workBytes = r.out;
      S.protection = "abierto";
      if (!S.suffix) S.suffix = "-sin-clave";
      setChip("ok", "Sin protección");
      renderLockPanel();
      showResult(r.out, outName(), "Protección retirada", "Este PDF ya se abre, imprime y copia sin restricciones.");
    }).catch(function (e) {
      busy(false);
      lockErr.hidden = false; lockErr.textContent = errMsg(e);
    });
  }

  /* ================= resultado y descarga ================= */

  function showResult(bytes, filename, title, text) {
    resultBytes = bytes; resultFile = filename;
    modalTitle.textContent = title;
    modalText.textContent = text || "";
    modalText.hidden = !text;
    modalName.textContent = filename + " · " + bytesLabel(bytes.length);
    modalNote.hidden = true;
    modalDl.disabled = false;
    modalDlLabel.textContent = "Descargar PDF";
    clearTimeout(modalTimer);
    modalShell.style.transform = "";
    modal.classList.remove("closing", "show");
    modal.hidden = false;
    document.body.classList.add("locked");
    requestAnimationFrame(function () { requestAnimationFrame(function () { modal.classList.add("show"); }); });
    setTimeout(function () { modalDl.focus({ preventScroll: true }); }, 60);
  }
  function closeModal() {
    if (modal.hidden || modal.classList.contains("closing")) return;
    modal.classList.remove("show");
    modal.classList.add("closing");
    document.body.classList.remove("locked");
    clearTimeout(modalTimer);
    modalTimer = setTimeout(function () {
      modal.hidden = true;
      modal.classList.remove("closing");
      modalShell.style.transform = "";
    }, 230);
  }

  // En celular la ventana es una hoja inferior: se cierra arrastrándola hacia abajo o con un gesto rápido.
  var sheetDrag = null;
  function isSheet() { return window.matchMedia("(max-width:560px)").matches; }
  modalCard.addEventListener("pointerdown", function (e) {
    if (!isSheet() || sheetDrag || e.target.closest("button")) return;
    sheetDrag = { id: e.pointerId, y0: e.clientY, t0: Date.now(), dy: 0 };
    try { modalCard.setPointerCapture(e.pointerId); } catch (err) {}
    modalShell.classList.add("dragging");
  });
  modalCard.addEventListener("pointermove", function (e) {
    if (!sheetDrag || e.pointerId !== sheetDrag.id) return;
    var dy = e.clientY - sheetDrag.y0;
    sheetDrag.dy = dy;
    modalShell.style.transform = "translateY(" + (dy > 0 ? dy : dy * 0.18) + "px)";
  });
  function endSheetDrag(e) {
    if (!sheetDrag || (e && e.pointerId !== sheetDrag.id)) return;
    var dy = sheetDrag.dy, v = Math.abs(dy) / Math.max(1, Date.now() - sheetDrag.t0);
    sheetDrag = null;
    modalShell.classList.remove("dragging");
    if (dy > 110 || (dy > 12 && v > 0.11)) { modalShell.style.transform = ""; closeModal(); }
    else modalShell.style.transform = "";
  }
  modalCard.addEventListener("pointerup", endSheetDrag);
  modalCard.addEventListener("pointercancel", endSheetDrag);
  modalClose.addEventListener("click", closeModal);
  modalBack.addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });

  function showModalNote(t) { modalNote.hidden = !t; if (t) modalNote.textContent = t; }

  modalDl.addEventListener("click", function () {
    if (!resultBytes) return;
    modalDl.disabled = true;
    modalDlLabel.textContent = "Preparando…";
    var blob = new Blob([resultBytes], { type: "application/pdf" });
    if (!(window.claude && window.claude.use)) {
      try {
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = resultFile; a.rel = "noopener";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 15000);
        modalDlLabel.textContent = "Descargado"; showModalNote("");
        setTimeout(function () { modalDl.disabled = false; modalDlLabel.textContent = "Descargar de nuevo"; }, 1200);
      } catch (e) {
        modalDl.disabled = false; modalDlLabel.textContent = "Descargar PDF";
        showModalNote("No se pudo descargar el archivo: " + errMsg(e));
      }
      return;
    }
    var api = (window.claude && window.claude.use) ? window.claude.use("downloads") : Promise.resolve(null);
    Promise.resolve(api).then(function (d) {
      if (!d) {
        modalDl.disabled = false; modalDlLabel.textContent = "Descargar PDF";
        showModalNote("Este visor no permite guardar archivos. Abre la página en claude.ai y vuelve a intentarlo.");
        return;
      }
      return d.save({ filename: resultFile, data: blob }).then(function () {
        modalDlLabel.textContent = "Descargado";
        showModalNote("");
        setTimeout(function () { modalDl.disabled = false; modalDlLabel.textContent = "Descargar de nuevo"; }, 1600);
      }).catch(function (err) {
        modalDl.disabled = false; modalDlLabel.textContent = "Descargar PDF";
        var code = err && err.code;
        if (code === "declined") { showModalNote(""); return; }
        showModalNote(code === "rate_limited"
          ? "Hay otra descarga en curso. Espera un momento y vuelve a pulsar."
          : "No se pudo guardar el archivo aquí. Abre la página en claude.ai y vuelve a intentarlo.");
      });
    }).catch(function () {
      modalDl.disabled = false; modalDlLabel.textContent = "Descargar PDF";
      showModalNote("No se pudo guardar el archivo aquí. Abre la página en claude.ai y vuelve a intentarlo.");
    });
  });

  /* ================= navegación ================= */

  var leaveArmed = false, leaveTimer = null;
  backBtn.addEventListener("click", function () {
    var n = S.edits.length;
    if (n && !leaveArmed) {
      leaveArmed = true;
      toast(n === 1 ? "Tienes 1 cambio sin descargar. Pulsa «Inicio» otra vez para descartarlo." : "Tienes " + n + " cambios sin descargar. Pulsa «Inicio» otra vez para descartarlos.");
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(function () { leaveArmed = false; }, 4500);
      return;
    }
    leaveArmed = false;
    resetWork();
    app.hidden = true;
    landing.hidden = false;
    window.scrollTo(0, 0);
  });

  noticeBtn.addEventListener("click", function () { picker.click(); });

  /* ---- menú móvil ---- */

  function openMenu() {
    menu.classList.add("open");
    menu.setAttribute("aria-hidden", "false");
    burger.setAttribute("aria-expanded", "true");
    burger.setAttribute("aria-label", "Cerrar menú");
    document.body.classList.add("locked");
  }
  function closeMenu() {
    if (!menu.classList.contains("open")) return;
    menu.classList.remove("open");
    menu.setAttribute("aria-hidden", "true");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Abrir menú");
    document.body.classList.remove("locked");
  }
  burger.addEventListener("click", function () { if (menu.classList.contains("open")) closeMenu(); else openMenu(); });
  Array.prototype.forEach.call(menu.querySelectorAll(".m-link"), function (a) { a.addEventListener("click", closeMenu); });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!modal.hidden) closeModal();
    else closeMenu();
  });

  /* ================= portada ================= */


  (function () {
    if (MODE !== "lock") { $("startSwitch").innerHTML = '¿Quieres poner o quitar una contraseña? <a href="/corregir?modo=contrasena">Ir a Contraseña PDF</a>'; return; }
    document.title = "Contraseña PDF · Folio PDF";
    $("startEyebrow").textContent = "CONTRASEÑA PDF";
    $("startTitle").innerHTML = "Pon o quita la <span>contraseña.</span>";
    $("startLead").textContent = "Protege tu PDF con contraseña, cámbiala o quítala si ya la conoces. El cifrado se hace en tu dispositivo.";
    $("startSwitch").innerHTML = '¿Necesitas cambiar el texto? <a href="/corregir">Ir a Corregir texto</a>';
  })();

  /* ---- cuenta obligatoria ---- */
  var Auth = window.TallerAuth, authSession = null, authReady = false;
  function goLogin() { location.href = "/entrar?next=" + encodeURIComponent(location.pathname + location.search); }
  function updateAuthUI() {
    var on = !!authSession, name = on ? Auth.displayName(authSession.user) : "";
    $("navLogin").hidden = on; $("navSignup").hidden = on;
    navPick.hidden = !on; $("navUser").hidden = !on;
    if (on) { $("navName").textContent = name; $("navAvatar").textContent = (name || "?").charAt(0).toUpperCase(); }
    $("mAuthOut").hidden = on; $("mAuthIn").hidden = !on;
    $("menuPickLabel").textContent = on ? "Abrir un PDF" : "Crear cuenta gratis";
    $("heroNote").hidden = on;
  }
  function logout() {
    closeMenu();
    Auth.signOut().then(function () {
      authSession = null;
      resetWork(); app.hidden = true; landing.hidden = false;
      updateAuthUI(); toast("Cerraste sesión.");
    });
  }
  $("navLogout").addEventListener("click", logout);
  $("menuLogout").addEventListener("click", logout);
  Auth.session().then(function (s) {
    authSession = s; authReady = true; updateAuthUI();
    var p = new URLSearchParams(location.search);
    if (p.get("listo")) {
      p.delete("listo"); history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p.toString() : "") + location.hash);
      if (s) toast("Listo, " + Auth.displayName(s.user) + ". Ya puedes elegir tu PDF.");
    }
  });
  Auth.onChange(function (ev, s) {
    authSession = s; updateAuthUI();
    // Si cierra sesión en otra pestaña, se cierra también aquí.
    if (!s && ev === "SIGNED_OUT" && !app.hidden) { resetWork(); app.hidden = true; landing.hidden = false; }
  });

  function pick(intent) {
    if (!authSession) {
      if (authReady) { goLogin(); return; }
      Auth.session().then(function (s) {
        authSession = s; authReady = true; updateAuthUI();
        if (!s) { goLogin(); return; }
        pendingIntent = intent || "edit"; picker.click();
      });
      return;
    }
    pendingIntent = intent || "edit"; picker.click();
  }
  pickBtn.addEventListener("click", function (e) { e.stopPropagation(); pick(MODE); });
  navPick.addEventListener("click", function () { pick(MODE); });
  menuPick.addEventListener("click", function () { pick(MODE); });
  dropzone.addEventListener("click", function () { pick(MODE); });
  dropzone.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(MODE); } });
  Array.prototype.forEach.call(document.querySelectorAll("[data-intent]"), function (b) {
    b.addEventListener("click", function () { pick(b.getAttribute("data-intent")); });
  });
  picker.addEventListener("change", function () { if (picker.files && picker.files[0]) handleFile(picker.files[0]); });

  // Soltar un archivo en cualquier parte de la portada.
  var dragDepth = 0;
  document.addEventListener("dragenter", function (e) {
    e.preventDefault();
    if (landing.hidden) return;
    dragDepth++; dropzone.classList.add("over");
  });
  document.addEventListener("dragleave", function () {
    if (landing.hidden) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropzone.classList.remove("over");
  });
  document.addEventListener("dragover", function (e) { e.preventDefault(); });
  document.addEventListener("drop", function (e) {
    e.preventDefault();
    dragDepth = 0; dropzone.classList.remove("over");
    if (landing.hidden) return;
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) { pendingIntent = MODE; handleFile(f); }
  });

  /* ---- entrada de secciones al hacer scroll ---- */
  // Solo se preparan los bloques que están por debajo de la pantalla al cargar; lo visible queda quieto.
  (function () {
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    var vh = window.innerHeight || 800;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.remove("rv-wait"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    var groups = {};
    Array.prototype.forEach.call(document.querySelectorAll(".rv"), function (n) {
      if (n.getBoundingClientRect().top < vh * 0.92) return;
      var parent = n.parentElement, key = parent ? (parent.className || "x") : "x";
      groups[key] = (groups[key] || 0) + 1;
      n.style.transitionDelay = Math.min(groups[key] - 1, 4) * 60 + "ms";
      n.classList.add("rv-wait");
      io.observe(n);
    });
  })();

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    if (window.innerWidth > 820) closeMenu();
    moveSegInd(true);
    if (!S.pdf || editView.hidden) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { renderPage(S.page); }, 220);
  });

  // Precarga el motor para que la primera operación sea inmediata.
  var warm = function () { loadWasm().catch(function () {}); };
  if (window.requestIdleCallback) window.requestIdleCallback(warm); else setTimeout(warm, 1500);
})();
