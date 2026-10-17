/*
  Folio PDF · límite de operaciones gratis por día.
  FolioLimite.usar() → Promise<boolean>. Cuenta una operación en Supabase; si la cuenta gratis
  ya usó las de hoy, muestra el aviso con los planes y devuelve false.
  Si Supabase no responde, deja pasar (no se bloquea a nadie por una caída).
*/
(function () {
  "use strict";
  var A = window.FolioAuth;
  var dlg = null;

  function aviso() {
    if (dlg) { dlg.showModal(); return; }
    dlg = document.createElement("dialog");
    dlg.setAttribute("aria-labelledby", "lim-t");
    dlg.style.cssText = "border:none;border-radius:20px;padding:0;max-width:420px;width:calc(100% - 32px);box-shadow:0 40px 90px -30px rgba(38,49,47,.45);font-family:Arial,Helvetica,sans-serif;color:#26312f";
    dlg.innerHTML =
      '<div style="padding:28px 26px 24px">' +
        '<div style="width:52px;height:52px;border-radius:15px;background:#fdeee8;color:#ee674b;display:grid;place-items:center;margin-bottom:14px">' +
          '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' +
        '</div>' +
        '<h2 id="lim-t" style="margin:0 0 8px;font-size:23px;letter-spacing:-.8px;line-height:1.15">Usaste tus 3 operaciones gratis de hoy</h2>' +
        '<p style="margin:0 0 18px;color:#5f6965;font-size:15px;line-height:1.5">Con un plan usas todas las herramientas sin límite. Mañana vuelves a tener 3 gratis.</p>' +
        '<div style="display:flex;flex-direction:column;gap:10px">' +
          '<a href="/precios" style="display:block;text-align:center;background:#ee674b;color:#fff;font-weight:bold;font-size:15px;padding:14px;border-radius:10px;text-decoration:none">Ver planes · desde $14.900</a>' +
          '<button type="button" data-cerrar style="background:#fff;border:1px solid #e6e9e5;color:#26312f;font-weight:600;font-size:14px;padding:12px;border-radius:10px;cursor:pointer">Ahora no</button>' +
        '</div>' +
      '</div>';
    dlg.querySelector("[data-cerrar]").addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  window.FolioLimite = {
    usar: function () {
      if (!A || !A.configured || typeof A.registrarUso !== "function") return Promise.resolve(true);
      return A.registrarUso().then(function (r) {
        if (r && r.ok === false) { aviso(); return false; }
        if (r && !r.ilimitado && typeof r.restantes === "number" && window.FolioLimite.onRestantes) window.FolioLimite.onRestantes(r.restantes);
        return true;
      }, function (e) {
        if (window.console) console.warn("No se pudo registrar el uso; se permite la operación.", e);
        return true;
      });
    },
    aviso: aviso,
    onRestantes: null
  };
})();
