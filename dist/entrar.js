(function () {
  "use strict";
  var A = window.TallerAuth;
  var sb = A.client;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var next = A.safeNext(params.get("next") || "/");
  var origin = location.origin;
  var finishing = false;

  var views = { auth: $("vAuth"), forgot: $("vForgot"), check: $("vCheck"), done: $("vDone") };
  function show(name) {
    Object.keys(views).forEach(function (k) {
      var on = k === name;
      if (on && views[k].hidden) { views[k].classList.remove("enter"); void views[k].offsetWidth; views[k].classList.add("enter"); }
      views[k].hidden = !on;
    });
  }

  function err(id, msg) { var n = $(id); n.hidden = !msg; if (msg) n.textContent = msg; }
  function busyBtn(btn, on, label) {
    btn.disabled = on;
    btn.querySelector(".lbl").textContent = label;
  }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  function mark(input, bad) { input.parentElement.classList.toggle("bad", !!bad); }

  /* ---------- pestañas ---------- */
  var mode = "signup";
  function setMode(m, focus) {
    mode = m;
    var login = m === "login";
    $("tabLogin").setAttribute("aria-selected", String(login));
    $("tabSignup").setAttribute("aria-selected", String(!login));
    $("segInd").style.clipPath = login ? "inset(0 50% 0 0 round 999px)" : "inset(0 0 0 50% round 999px)";
    $("loginForm").hidden = !login;
    $("signupForm").hidden = login;
    $("authTitle").textContent = login ? "Bienvenido de nuevo" : "Crea tu cuenta gratis";
    $("authLede").textContent = login ? "Entra para seguir trabajando con tus PDF." : "Necesitas una cuenta para usar las herramientas de Folio PDF. Toma menos de un minuto.";
    $("googleLabel").textContent = login ? "Entrar con Google" : "Registrarme con Google";
    err("loginErr", ""); err("signupErr", "");
    if (focus) setTimeout(function () { (login ? $("loginEmail") : $("suName")).focus(); }, 30);
  }
  $("tabLogin").addEventListener("click", function () { setMode("login", true); });
  $("tabSignup").addEventListener("click", function () { setMode("signup", true); });

  Array.prototype.forEach.call(document.querySelectorAll("[data-eye]"), function (b) {
    b.addEventListener("click", function () {
      var i = $(b.getAttribute("data-eye")), hidden = i.type === "password";
      i.type = hidden ? "text" : "password"; b.textContent = hidden ? "Ocultar" : "Ver"; i.focus();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-back]"), function (b) {
    b.addEventListener("click", function () { show("auth"); setMode("login", true); });
  });

  /* ---------- medidor de contraseña ---------- */
  function strength(p) {
    if (!p) return 0;
    var s = 0;
    if (p.length >= 8) s++;
    if (/[a-zA-ZñÑ]/.test(p) && /\d/.test(p)) s++;
    if (p.length >= 12) s++;
    if (/[^a-zA-Z0-9]/.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) s++;
    return Math.max(1, s);
  }
  $("suPw").addEventListener("input", function () {
    var lv = strength(this.value);
    $("meter").setAttribute("data-level", String(lv));
    $("pwHint").textContent = !this.value ? "Mínimo 8 caracteres. Mezcla letras y números." :
      this.value.length < 8 ? "Te faltan " + (8 - this.value.length) + " caracteres." :
      lv <= 2 ? "Aceptable. Más larga o con símbolos sería más segura." : "Buena contraseña.";
    mark(this, false);
  });
  ["loginEmail", "loginPw", "suName", "suEmail", "fgEmail"].forEach(function (id) {
    $(id).addEventListener("input", function () { mark(this, false); });
  });
  $("consent").addEventListener("change", function () { $("consentRow").classList.remove("bad"); });

  /* ---------- sin configurar ---------- */
  if (!A.configured) {
    $("notConfigured").hidden = false;
    Array.prototype.forEach.call(document.querySelectorAll("#card button, #card input"), function (n) { n.disabled = true; });
  }
  if (A.config.GOOGLE === false) { $("googleBtn").hidden = true; $("googleLegal").hidden = true; $("orSep").hidden = true; }

  /* ---------- volver al sitio cuando hay sesión ---------- */
  function finish() {
    if (finishing) return;
    finishing = true;
    show("done");
    var dest = A.withParam(next, "listo", "1");
    location.replace(dest);
  }

  /* ---------- entrar ---------- */
  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("loginEmail").value.trim(), pw = $("loginPw").value;
    err("loginErr", "");
    if (!validEmail(email)) { mark($("loginEmail"), true); err("loginErr", "Escribe un correo válido."); $("loginEmail").focus(); return; }
    if (!pw) { mark($("loginPw"), true); err("loginErr", "Escribe tu contraseña."); $("loginPw").focus(); return; }
    var btn = $("loginBtn"); busyBtn(btn, true, "Entrando…");
    sb.auth.signInWithPassword({ email: email, password: pw }).then(function (r) {
      if (r.error) {
        busyBtn(btn, false, "Entrar");
        err("loginErr", A.translate(r.error));
        if ((r.error.code || "") === "email_not_confirmed") { pendingEmail = email; }
        return;
      }
      finish();
    }).catch(function (x) { busyBtn(btn, false, "Entrar"); err("loginErr", A.translate(x)); });
  });

  /* ---------- crear cuenta ---------- */
  var pendingEmail = "", resendType = "signup";
  $("signupForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("suName").value.trim(), email = $("suEmail").value.trim(), pw = $("suPw").value;
    err("signupErr", "");
    if (!name) { mark($("suName"), true); err("signupErr", "Escribe tu nombre."); $("suName").focus(); return; }
    if (!validEmail(email)) { mark($("suEmail"), true); err("signupErr", "Escribe un correo válido."); $("suEmail").focus(); return; }
    if (pw.length < 8) { mark($("suPw"), true); err("signupErr", "La contraseña necesita al menos 8 caracteres."); $("suPw").focus(); return; }
    if (!$("consent").checked) { $("consentRow").classList.add("bad"); err("signupErr", "Para crear la cuenta necesitamos tu autorización para tratar tus datos."); return; }
    var btn = $("signupBtn"); busyBtn(btn, true, "Creando cuenta…");
    sb.auth.signUp({
      email: email, password: pw,
      options: {
        emailRedirectTo: origin + "/entrar?confirmado=1&next=" + encodeURIComponent(next),
        // Prueba de la autorización (Ley 1581): quedan guardadas la fecha y la versión de la política aceptada.
        data: { full_name: name, autorizacion_datos: { aceptada: true, fecha: new Date().toISOString(), version_politica: A.config.POLITICA_VERSION || "" } }
      }
    }).then(function (r) {
      busyBtn(btn, false, "Crear cuenta");
      if (r.error) { err("signupErr", A.translate(r.error)); return; }
      var d = r.data || {};
      // Con la confirmación activada, Supabase responde "bien" aunque el correo ya exista, pero sin identidades.
      if (d.user && Array.isArray(d.user.identities) && d.user.identities.length === 0) {
        err("signupErr", "Ya existe una cuenta con ese correo. Entra o recupera tu contraseña.");
        return;
      }
      if (d.session) { finish(); return; }
      pendingEmail = email; resendType = "signup";
      $("checkTitle").textContent = "Confirma tu correo";
      $("checkText").textContent = "Te enviamos un enlace a " + email + ". Ábrelo para activar tu cuenta y entrar.";
      show("check"); startCooldown();
    }).catch(function (x) { busyBtn(btn, false, "Crear cuenta"); err("signupErr", A.translate(x)); });
  });

  /* ---------- Google ---------- */
  $("googleBtn").addEventListener("click", function () {
    var b = this; b.disabled = true;
    sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: origin + "/entrar?next=" + encodeURIComponent(next) }
    }).then(function (r) {
      if (r.error) { b.disabled = false; err(mode === "login" ? "loginErr" : "signupErr", A.translate(r.error)); }
    }).catch(function (x) { b.disabled = false; err(mode === "login" ? "loginErr" : "signupErr", A.translate(x)); });
  });

  /* ---------- recuperar ---------- */
  $("toForgot").addEventListener("click", function () {
    $("fgEmail").value = $("loginEmail").value.trim();
    err("forgotErr", ""); show("forgot");
    setTimeout(function () { $("fgEmail").focus(); }, 30);
  });
  $("forgotForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("fgEmail").value.trim();
    if (!validEmail(email)) { mark($("fgEmail"), true); err("forgotErr", "Escribe un correo válido."); return; }
    var btn = $("forgotBtn"); busyBtn(btn, true, "Enviando…");
    sb.auth.resetPasswordForEmail(email, { redirectTo: origin + "/restablecer" }).then(function (r) {
      busyBtn(btn, false, "Enviar enlace");
      if (r.error) { err("forgotErr", A.translate(r.error)); return; }
      pendingEmail = email; resendType = "recovery";
      $("checkTitle").textContent = "Revisa tu correo";
      // No confirmamos si el correo existe: así nadie puede averiguar quién tiene cuenta.
      $("checkText").textContent = "Si " + email + " tiene una cuenta, te llegará un enlace para elegir una contraseña nueva. Ábrelo en este mismo navegador.";
      show("check"); startCooldown();
    }).catch(function (x) { busyBtn(btn, false, "Enviar enlace"); err("forgotErr", A.translate(x)); });
  });

  /* ---------- reenviar ---------- */
  var cdTimer = null;
  function startCooldown() {
    var left = 60, b = $("resendBtn");
    b.disabled = true;
    clearInterval(cdTimer);
    b.textContent = "Reenviar en " + left + " s";
    cdTimer = setInterval(function () {
      left--;
      if (left <= 0) { clearInterval(cdTimer); b.disabled = false; b.textContent = "Reenviar correo"; }
      else b.textContent = "Reenviar en " + left + " s";
    }, 1000);
  }
  $("resendBtn").addEventListener("click", function () {
    err("checkErr", "");
    var p = resendType === "recovery"
      ? sb.auth.resetPasswordForEmail(pendingEmail, { redirectTo: origin + "/restablecer" })
      : sb.auth.resend({ type: "signup", email: pendingEmail, options: { emailRedirectTo: origin + "/entrar?confirmado=1&next=" + encodeURIComponent(next) } });
    p.then(function (r) { if (r && r.error) err("checkErr", A.translate(r.error)); else startCooldown(); })
     .catch(function (x) { err("checkErr", A.translate(x)); });
  });

  /* ---------- arranque ---------- */
  var urlErr = params.get("error_description") || new URLSearchParams(location.hash.slice(1)).get("error_description");
  if (urlErr) { setMode("login"); err("loginErr", A.translate({ message: urlErr, code: params.get("error_code") || "" })); }
  else setMode(params.get("modo") === "entrar" || params.get("modo") === "login" ? "login" : "signup");

  if (params.get("confirmado")) { $("banner").hidden = false; $("banner").textContent = "Correo confirmado. Ya puedes entrar."; setMode("login"); }
  if (params.get("salir")) { $("banner").hidden = false; $("banner").textContent = "Cerraste sesión."; setMode("login"); }
  if (params.get("modo") === "recuperar") { show("forgot"); }

  if (A.configured) {
    A.onChange(function (ev, s) { if (s && (ev === "SIGNED_IN" || ev === "INITIAL_SESSION")) finish(); });
    A.session().then(function (s) { if (s) finish(); });
  }
})();
