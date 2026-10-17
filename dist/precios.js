/* Folio PDF · página de precios: crea el pago en el servidor y lleva al checkout de Wompi. */
(function () {
  "use strict";
  var A = window.FolioAuth;
  var msg = document.getElementById("msg");

  function error(t) { msg.hidden = !t; msg.textContent = t || ""; }

  Array.prototype.forEach.call(document.querySelectorAll("[data-plan]"), function (btn) {
    btn.addEventListener("click", function () {
      var plan = btn.getAttribute("data-plan");
      var lbl = btn.querySelector(".lbl"), original = lbl.textContent;
      error("");
      if (!A || !A.configured) { error("Los pagos todavía no están disponibles."); return; }
      btn.disabled = true; lbl.textContent = "Preparando el pago…";
      A.session().then(function (s) {
        if (!s) { location.href = "/entrar?next=" + encodeURIComponent("/precios"); return null; }
        return A.funcion("crear-pago", { plan: plan });
      }).then(function (r) {
        if (!r) return;
        if (!r.url || r.url.indexOf("https://checkout.wompi.co/") !== 0) throw new Error("No se pudo abrir el pago. Intenta de nuevo.");
        location.href = r.url;
      }).catch(function (e) {
        btn.disabled = false; lbl.textContent = original;
        error(A.translate ? A.translate(e) : String(e && e.message || e));
      });
    });
  });
})();
