/*
  Folio PDF · sesión de usuario (Supabase Auth).
  Lo usan la portada, /corregir, /entrar y /restablecer.
*/
(function () {
  "use strict";

  var cfg = window.FOLIO_CONFIG || window.TALLER_CONFIG || {};
  var configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !/TU-PROYECTO/.test(cfg.SUPABASE_URL) && !/TU_CLAVE/.test(cfg.SUPABASE_ANON_KEY));

  var client = null;
  if (configured && window.supabase && window.supabase.createClient) {
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  // Mensajes de Supabase traducidos a algo que la gente entienda y pueda resolver.
  var BY_CODE = {
    invalid_credentials: "El correo o la contraseña no coinciden. Revisa mayúsculas y espacios.",
    email_not_confirmed: "Todavía no confirmaste tu correo. Busca el mensaje que te enviamos (revisa también Spam).",
    user_already_exists: "Ya existe una cuenta con ese correo. Entra o recupera tu contraseña.",
    email_exists: "Ya existe una cuenta con ese correo. Entra o recupera tu contraseña.",
    weak_password: "Esa contraseña es muy débil. Usa al menos 8 caracteres combinando letras y números.",
    same_password: "La contraseña nueva tiene que ser distinta de la anterior.",
    over_email_send_rate_limit: "Enviamos demasiados correos en poco tiempo. Espera unos minutos y vuelve a intentarlo.",
    over_request_rate_limit: "Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.",
    email_address_not_authorized: "No pudimos enviar el correo a esa dirección. El servicio de correo del sitio aún no está configurado.",
    email_address_invalid: "Ese correo no parece válido. Revísalo.",
    validation_failed: "Revisa los datos: falta algo o tiene un formato incorrecto.",
    signup_disabled: "El registro de cuentas nuevas está cerrado por ahora.",
    provider_disabled: "Ese método de inicio de sesión no está activado.",
    session_not_found: "Tu sesión venció. Vuelve a entrar.",
    flow_state_not_found: "El enlace ya se usó o venció. Pide uno nuevo.",
    flow_state_expired: "El enlace venció. Pide uno nuevo.",
    otp_expired: "El enlace venció o ya se usó. Pide uno nuevo."
  };

  function translate(err) {
    if (!err) return "";
    var code = err.code || err.error_code || "";
    if (BY_CODE[code]) return BY_CODE[code];
    var m = String(err.message || err.error_description || err);
    if (/invalid login credentials/i.test(m)) return BY_CODE.invalid_credentials;
    if (/email not confirmed/i.test(m)) return BY_CODE.email_not_confirmed;
    if (/already registered|already exists/i.test(m)) return BY_CODE.user_already_exists;
    if (/password should be|weak password|at least/i.test(m)) return BY_CODE.weak_password;
    if (/rate limit/i.test(m)) return BY_CODE.over_email_send_rate_limit;
    if (/after \d+ seconds/i.test(m)) return "Por seguridad, espera unos segundos antes de volver a intentarlo.";
    if (/not authorized/i.test(m)) return BY_CODE.email_address_not_authorized;
    if (/invalid format|invalid email|unable to validate email/i.test(m)) return BY_CODE.email_address_invalid;
    if (/different from the old/i.test(m)) return BY_CODE.same_password;
    if (/failed to fetch|network/i.test(m)) return "No hay conexión con el servidor. Revisa tu internet y vuelve a intentarlo.";
    if (/code verifier|both auth code and code verifier/i.test(m)) return "Abre el enlace en el mismo navegador donde lo pediste, o pide uno nuevo.";
    return "Algo falló: " + m;
  }

  // Solo se aceptan destinos dentro del propio sitio, para que nadie use /entrar como trampolín a otra web.
  function safeNext(raw) {
    if (!raw || typeof raw !== "string") return "/";
    if (raw.charAt(0) !== "/" || raw.charAt(1) === "/" || raw.charAt(1) === "\\") return "/";
    return raw;
  }

  // Añade un parámetro respetando el # final (p. ej. /#herramienta/unir).
  function withParam(path, key, value) {
    var hash = "", i = path.indexOf("#");
    if (i >= 0) { hash = path.slice(i); path = path.slice(0, i); }
    return path + (path.indexOf("?") >= 0 ? "&" : "?") + key + "=" + encodeURIComponent(value) + hash;
  }

  function displayName(user) {
    if (!user) return "";
    var md = user.user_metadata || {};
    var n = md.full_name || md.name || "";
    if (n) return String(n).split(" ")[0];
    return (user.email || "").split("@")[0];
  }

  window.FolioAuth = window.TallerAuth = {
    configured: !!client,
    client: client,
    config: cfg,
    translate: translate,
    safeNext: safeNext,
    withParam: withParam,
    displayName: displayName,
    session: function () {
      if (!client) return Promise.resolve(null);
      return client.auth.getSession().then(function (r) { return (r && r.data && r.data.session) || null; })
        .catch(function () { return null; });
    },
    onChange: function (fn) {
      if (!client) return;
      client.auth.onAuthStateChange(function (event, session) { fn(event, session); });
    },
    signOut: function () {
      if (!client) return Promise.resolve();
      return client.auth.signOut().catch(function () {});
    }
  };
})();
