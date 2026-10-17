/* Folio PDF · Mi cuenta: plan, usos de hoy, historial y confirmación del pago al volver de Wompi. */
(function () {
  "use strict";
  var A = window.FolioAuth, sb = A && A.client;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var ref = params.get("ref"), txId = params.get("id");

  var PLAN = { mensual: "Pro mensual", anual: "Pro anual" };
  var ESTADO = {
    APPROVED: ["Aprobado", "ok"], PENDIENTE: ["Pendiente", "warn"], PENDING: ["Pendiente", "warn"],
    DECLINED: ["Rechazado", "err"], VOIDED: ["Anulado", "err"], ERROR: ["Error", "err"], MONTO_INCORRECTO: ["Revisar", "err"]
  };
  function fecha(iso) { return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }); }
  function pesos(c) { return "$" + Math.round(c / 100).toLocaleString("es-CO"); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  if (!A || !A.configured) { $("planBox").textContent = "El inicio de sesión no está configurado."; return; }

  $("salir").addEventListener("click", function () { A.signOut().then(function () { location.replace("/entrar?salir=1"); }); });

  A.session().then(function (s) {
    if (!s) { location.replace("/entrar?next=" + encodeURIComponent(location.pathname + location.search)); return; }
    $("hola").textContent = "Hola, " + A.displayName(s.user);
    $("correo").textContent = s.user.email || "";
    if (ref) confirmarPago(0); else cargar();
  });

  function pagoMsg(texto, tipo) { var m = $("pagoMsg"); m.hidden = false; m.className = "note " + tipo; m.textContent = texto; }

  // Al volver de Wompi: el servidor consulta a Wompi y activa el plan. Reintenta mientras esté pendiente (PSE).
  function confirmarPago(intento) {
    pagoMsg("Confirmando tu pago con Wompi…", "info");
    A.funcion("confirmar-pago", { ref: ref, id: txId }).then(function (r) {
      var e = r && r.estado;
      if (r && r.aplicado) {
        pagoMsg("¡Pago aprobado! Tu plan " + (PLAN[r.plan] || "") + " ya está activo. Gracias por apoyar Folio PDF.", "ok");
      } else if (e === "DECLINED" || e === "VOIDED" || e === "ERROR") {
        pagoMsg("El pago no se aprobó. No se te cobró nada. Puedes intentarlo de nuevo desde Planes.", "err");
      } else if (intento < 6) {
        pagoMsg("Tu pago está en proceso. Esto puede tardar unos minutos con PSE…", "warn");
        setTimeout(function () { confirmarPago(intento + 1); }, 5000);
        return;
      } else {
        pagoMsg("Tu pago sigue en proceso. Cuando el banco lo confirme, tu plan se activará solo; puedes cerrar esta página.", "warn");
      }
      history.replaceState(null, "", location.pathname);
      cargar();
    }).catch(function (x) {
      pagoMsg("No pudimos confirmar el pago ahora: " + (x && x.message ? x.message : x) + ". Si se aprobó, tu plan se activará en unos minutos.", "warn");
      cargar();
    });
  }

  function cargar() {
    A.estadoPlan().then(pintarPlan).catch(function () {
      $("planBox").textContent = "No pudimos cargar tu plan. Recarga la página.";
    });
    sb.from("pagos").select("referencia, plan, monto_centavos, estado, metodo, creado")
      .order("creado", { ascending: false }).limit(12).then(function (r) {
        if (r.error || !r.data) return;
        var visibles = r.data.filter(function (p) { return p.estado !== "PENDIENTE"; });
        if (!visibles.length) return;
        var ul = $("hist"); ul.innerHTML = "";
        visibles.forEach(function (p) {
          var li = el("li"), izq = el("span"), est = ESTADO[p.estado] || [p.estado, "warn"];
          izq.appendChild(el("b", null, PLAN[p.plan] || p.plan));
          izq.appendChild(document.createTextNode(" · " + pesos(p.monto_centavos) + " · " + fecha(p.creado)));
          li.appendChild(izq); li.appendChild(el("span", "pill-s " + est[1], est[0]));
          ul.appendChild(li);
        });
        $("histCard").hidden = false;
      });
  }

  function pintarPlan(e) {
    var box = $("planBox"); box.innerHTML = "";
    var row = el("div", "row");
    var left = el("div");
    if (e && e.activo) {
      left.appendChild(el("span", "state on", "Plan activo"));
      left.appendChild(el("p", "big", PLAN[e.plan] || "Pro"));
      var dias = Math.ceil((new Date(e.vence) - new Date()) / 86400000);
      left.appendChild(el("p", "fine", "Vence el " + fecha(e.vence) + (dias <= 7 ? " · quedan " + dias + (dias === 1 ? " día" : " días") : "") + ". Operaciones ilimitadas."));
      row.appendChild(left);
      var a = el("a", "pill", "Extender plan"); a.href = "/precios"; row.appendChild(a);
      $("usoCard").hidden = true;
    } else {
      left.appendChild(el("span", "state off", "Plan gratis"));
      left.appendChild(el("p", "big", "Básico"));
      left.appendChild(el("p", "fine", e && e.vence ? "Tu plan anterior venció el " + fecha(e.vence) + "." : "3 operaciones gratis al día con todas las herramientas."));
      row.appendChild(left);
      var b = el("a", "cta", null); b.href = "/precios";
      b.appendChild(el("span", null, "Ver planes"));
      var orb = el("span", "orb"); orb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>';
      b.appendChild(orb); row.appendChild(b);
      var lim = (e && e.limite) || 3, usados = Math.min((e && e.usos_hoy) || 0, lim);
      $("usoTxt").textContent = usados + " de " + lim + " usadas";
      $("usoBar").style.width = Math.round(usados / lim * 100) + "%";
      $("usoCard").hidden = false;
    }
    box.appendChild(row);
  }
})();
