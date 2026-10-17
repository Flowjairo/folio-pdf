(function () {
  "use strict";
  var A = window.TallerAuth, sb = A.client;
  var $ = function (id) { return document.getElementById(id); };
  function show(id) { ["vWait", "vForm", "vBad", "vOk"].forEach(function (v) { $(v).hidden = v !== id; }); }

  Array.prototype.forEach.call(document.querySelectorAll("[data-eye]"), function (b) {
    b.addEventListener("click", function () {
      var i = $(b.getAttribute("data-eye")), hidden = i.type === "password";
      i.type = hidden ? "text" : "password"; b.textContent = hidden ? "Ocultar" : "Ver"; i.focus();
    });
  });

  if (!A.configured) { $("badText").textContent = "El inicio de sesión todavía no está configurado en este sitio."; show("vBad"); return; }

  var params = new URLSearchParams(location.search), hash = new URLSearchParams(location.hash.slice(1));
  var urlErr = params.get("error_description") || hash.get("error_description");
  if (urlErr) { $("badText").textContent = A.translate({ message: urlErr, code: params.get("error_code") || hash.get("error_code") || "" }); show("vBad"); return; }

  var ready = false;
  function ok() { if (ready) return; ready = true; show("vForm"); setTimeout(function () { $("pw1").focus(); }, 30); }
  A.onChange(function (ev, s) { if (s && (ev === "PASSWORD_RECOVERY" || ev === "SIGNED_IN" || ev === "INITIAL_SESSION")) ok(); });
  A.session().then(function (s) { if (s) ok(); });
  // Si en unos segundos no hay sesión, el enlace no era válido para este navegador.
  setTimeout(function () { if (!ready) show("vBad"); }, 6000);

  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    var a = $("pw1").value, b = $("pw2").value, er = $("err");
    er.hidden = true;
    if (a.length < 8) { er.hidden = false; er.textContent = "La contraseña necesita al menos 8 caracteres."; $("pw1").focus(); return; }
    if (a !== b) { er.hidden = false; er.textContent = "Las dos contraseñas no coinciden."; $("pw2").select(); return; }
    var btn = $("btn"); btn.disabled = true; btn.querySelector(".lbl").textContent = "Guardando…";
    sb.auth.updateUser({ password: a }).then(function (r) {
      if (r.error) { btn.disabled = false; btn.querySelector(".lbl").textContent = "Guardar contraseña"; er.hidden = false; er.textContent = A.translate(r.error); return; }
      show("vOk");
      setTimeout(function () { location.replace("/?listo=1"); }, 1400);
    }).catch(function (x) { btn.disabled = false; btn.querySelector(".lbl").textContent = "Guardar contraseña"; er.hidden = false; er.textContent = A.translate(x); });
  });
})();
