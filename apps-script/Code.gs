const GALAXY_SUPABASE_URL = 'https://xdsqtuubsptpzwadecha.supabase.co';
const GALAXY_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkc3F0dXVic3B0cHp3YWRlY2hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjQ0MjgsImV4cCI6MjEwMjQ0MDQyOH0.KAoFXQ3cIk8TW4zfVGrg860GNOErOtcyPVcwh0jpPx0';
const GALAXY_REGISTRATION_URL = 'https://devnnex.github.io/PROJECT-GALAXY.COM/dist/index.html';

/*
 * PROJECT GALAXY · Supabase Send Email Auth Hook
 *
 * Este Web App solo transporta correos de Auth. Supabase genera y valida los
 * tokens; el script nunca recibe ni necesita credenciales administrativas.
 */

const AUTH_ACTIONS = Object.freeze({
  signup: {
    subject: 'Confirma tu acceso a PROJECT GALAXY',
    title: 'Confirma tu cuenta',
    copy: 'Activa tu cuenta para comenzar a usar PROJECT GALAXY.',
    button: 'Confirmar mi correo',
  },
  invite: {
    subject: 'Te invitaron a PROJECT GALAXY',
    title: 'Acepta tu invitación',
    copy: 'Usa este enlace seguro para aceptar tu invitación.',
    button: 'Aceptar invitación',
  },
  magiclink: {
    subject: 'Tu acceso seguro a PROJECT GALAXY',
    title: 'Accede a tu cuenta',
    copy: 'Solicitaste un enlace temporal para acceder.',
    button: 'Acceder',
  },
  magic_link: {
    subject: 'Tu acceso seguro a PROJECT GALAXY',
    title: 'Accede a tu cuenta',
    copy: 'Solicitaste un enlace temporal para acceder.',
    button: 'Acceder',
  },
  recovery: {
    subject: 'Restablece tu contraseña de PROJECT GALAXY',
    title: 'Restablece tu contraseña',
    copy: 'Solicitaste recuperar el acceso a tu cuenta.',
    button: 'Restablecer contraseña',
  },
  email_change: {
    subject: 'Confirma tu nuevo correo en PROJECT GALAXY',
    title: 'Confirma el cambio de correo',
    copy: 'Confirma esta dirección para completar el cambio.',
    button: 'Confirmar nuevo correo',
  },
  reauthentication: {
    subject: 'Código de seguridad de PROJECT GALAXY',
    title: 'Confirma que eres tú',
    copy: 'Usa este enlace o el código temporal para continuar.',
    button: 'Confirmar identidad',
  },
});

function doGet() {
  return jsonOutput_({ ok: true, service: 'PROJECT GALAXY Auth Mail Hook' });
}

function doPost(event) {
  // Separate authenticated mail-only transport; preserves the existing Auth hook.
  const invitationBody = String(event && event.postData && event.postData.contents || '');
  if (invitationBody.length <= 100000) {
    try {
      const invitationPayload = JSON.parse(invitationBody);
      if (invitationPayload.action === 'registration_invitation') return sendRegistrationInvitation_(invitationPayload);
    } catch (error) {
      if (invitationBody.indexOf('registration_invitation') !== -1) {
        return jsonOutput_({ ok: false, error: String(error && error.message || 'No se pudo enviar la invitación.') });
      }
    }
  }
  const properties = PropertiesService.getScriptProperties();
  const expectedKey = requireProperty_(properties, 'GALAXY_HOOK_KEY');
  if (expectedKey.length < 32) {
    throw new Error('GALAXY_HOOK_KEY debe tener al menos 32 caracteres.');
  }
  const suppliedKey = String(event && event.parameter && event.parameter.hook_key || '');

  if (!constantTimeEqual_(suppliedKey, expectedKey)) {
    throw new Error('Solicitud de hook no autorizada.');
  }

  const rawBody = String(event && event.postData && event.postData.contents || '');
  if (!rawBody || rawBody.length > 100000) throw new Error('Carga de hook inválida.');

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    throw new Error('El hook no contiene JSON válido.');
  }

  const user = payload && payload.user || {};
  const emailData = payload && payload.email_data || {};
  const action = String(emailData.email_action_type || '');
  const template = AUTH_ACTIONS[action];
  if (!template) throw new Error('Tipo de correo de Auth no permitido.');
  if (!isUuid_(user.id)) throw new Error('Usuario de Auth inválido.');

  const supabaseUrl = requireHttpsUrl_(requireProperty_(properties, 'SUPABASE_URL'), 'SUPABASE_URL');
  const redirectUrl = requireHttpsUrl_(requireProperty_(properties, 'APP_REDIRECT_URL'));
  const payloadSiteUrl = requireHttpsUrl_(String(emailData.site_url || ''));
  if (normalizeUrl_(payloadSiteUrl) !== normalizeUrl_(redirectUrl)) {
    throw new Error('El sitio de Auth no coincide.');
  }
  const messages = buildMessages_(user, emailData, action);
  if (!messages.length) throw new Error('No hay un token de Auth válido para enviar.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(500)) throw new Error('El servicio de correo está ocupado.');
  try {
    const cache = CacheService.getScriptCache();
    messages.forEach(function (message) {
      const fingerprint = digestHex_([
        user.id, action, message.to, message.tokenHash,
      ].join('|'));
      if (cache.get(fingerprint)) return;
      if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Se agotó la cuota diaria de correo.');

      const verifyUrl = buildVerificationUrl_(supabaseUrl, message.tokenHash, action, redirectUrl);
      MailApp.sendEmail({
        to: message.to,
        subject: template.subject,
        body: buildTextBody_(template, verifyUrl, message.token),
        htmlBody: buildHtmlBody_(template, verifyUrl, message.token),
        name: 'PROJECT GALAXY',
      });
      cache.put(fingerprint, 'sent', 21600);
    });
  } finally {
    lock.releaseLock();
  }

  return jsonOutput_({});
}

// Ejecuta esta función una vez desde el editor después de pegar Code.gs y el
// manifiesto. Autoriza tanto MailApp como la consulta HTTPS de invitaciones.
function resetGalaxyAuthorization() {
  ScriptApp.invalidateAuth();
}

function authorizeMailAccess() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const response = UrlFetchApp.fetch(GALAXY_SUPABASE_URL + '/auth/v1/health', {
    method: 'get',
    muteHttpExceptions: true,
  });
  return {
    remainingDailyQuota: MailApp.getRemainingDailyQuota(),
    supabaseReachable: response.getResponseCode() >= 200 && response.getResponseCode() < 500,
  };
}

function buildMessages_(user, emailData, action) {
  if (action === 'email_change' && user.new_email) {
    const messages = [];
    if (isEmail_(user.email) && isTokenHash_(emailData.token_hash_new)) {
      messages.push({ to: user.email, token: emailData.token, tokenHash: emailData.token_hash_new });
    }
    if (isEmail_(user.new_email) && isTokenHash_(emailData.token_hash)) {
      messages.push({ to: user.new_email, token: emailData.token_new || emailData.token, tokenHash: emailData.token_hash });
    }
    return messages;
  }

  if (!isEmail_(user.email) || !isTokenHash_(emailData.token_hash)) return [];
  return [{ to: user.email, token: emailData.token, tokenHash: emailData.token_hash }];
}

function buildVerificationUrl_(supabaseUrl, tokenHash, action, redirectUrl) {
  return supabaseUrl + '/auth/v1/verify?token=' + encodeURIComponent(tokenHash)
    + '&type=' + encodeURIComponent(action)
    + '&redirect_to=' + encodeURIComponent(redirectUrl);
}

function buildTextBody_(template, verifyUrl, token) {
  return template.title + '\n\n' + template.copy + '\n\n'
    + verifyUrl + '\n\nCódigo temporal: ' + String(token || '')
    + '\n\nSi no realizaste esta solicitud, ignora este mensaje.';
}

function buildHtmlBody_(template, verifyUrl, token) {
  const safeUrl = escapeHtml_(verifyUrl);
  const safeToken = escapeHtml_(String(token || ''));
  return '<!doctype html><html><body style="margin:0;background:#08070d;color:#f7f4ff;font-family:Arial,sans-serif">'
    + '<div style="max-width:560px;margin:0 auto;padding:40px 24px">'
    + '<p style="color:#c8a8ff;letter-spacing:2px;font-size:12px">PROJECT GALAXY</p>'
    + '<h1 style="font-size:30px;margin:16px 0">' + escapeHtml_(template.title) + '</h1>'
    + '<p style="color:#c9c3d6;line-height:1.65">' + escapeHtml_(template.copy) + '</p>'
    + '<p style="margin:32px 0"><a href="' + safeUrl + '" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#9b6cff;color:#fff;text-decoration:none;font-weight:700">'
    + escapeHtml_(template.button) + '</a></p>'
    + '<p style="color:#9991a8;font-size:13px">Código temporal</p>'
    + '<p style="font-size:24px;letter-spacing:5px;font-weight:700">' + safeToken + '</p>'
    + '<p style="margin-top:36px;color:#777181;font-size:12px;line-height:1.5">Si no realizaste esta solicitud, ignora este mensaje.</p>'
    + '</div></body></html>';
}

function requireProperty_(properties, name) {
  const value = String(properties.getProperty(name) || '').trim();
  if (!value) throw new Error('Falta la propiedad segura ' + name + '.');
  return value;
}

function normalizeUrl_(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function requireHttpsUrl_(value, propertyName) {
  const normalized = normalizeUrl_(value);
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s]*)?$/i.test(normalized)) {
    throw new Error(String(propertyName || 'APP_REDIRECT_URL') + ' debe usar HTTPS.');
  }
  return normalized;
}

function isEmail_(value) {
  return typeof value === 'string' && value.length <= 320
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUuid_(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isTokenHash_(value) {
  return typeof value === 'string' && /^[0-9a-f]{40,128}$/i.test(value);
}

function constantTimeEqual_(left, right) {
  const a = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(left));
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(right));
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0 && String(left).length === String(right).length;
}

function digestHex_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value)
    .map(function (byte) { return ('0' + (byte & 255).toString(16)).slice(-2); })
    .join('');
}

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
  });
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}


// Registration invitations: mail transport only.
function sendRegistrationInvitation_(payload) {
  const token = String(payload && payload.token || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Token de invitación inválido.');
  const invitation = verifyRegistrationInvitation_(token);
  const email = String(invitation.email || '');
  const expiresAt = new Date(invitation.expires_at).getTime();
  if (!isEmail_(email) || !isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error('La invitación ya no está vigente.');
  const link = GALAXY_REGISTRATION_URL + '#registration=' + token;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Correo ocupado.');
  try {
    const cache = CacheService.getScriptCache(); const fingerprint = digestHex_('registration|' + token);
    if (cache.get(fingerprint)) return jsonOutput_({ ok: true });
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Cuota de correo agotada.');
    const planName = String(invitation.planName || invitation.plan_code || 'seleccionada');
    MailApp.sendEmail({
      to: email,
      subject: 'Tu invitación a PROJECT GALAXY',
      name: 'PROJECT GALAXY',
      body: 'Te invitamos a registrarte con la membresía ' + planName + '.\n\n' + link + '\n\nEl enlace vence 7 minutos después de su creación y solo se puede usar una vez.',
      htmlBody: '<!doctype html><html><body style="margin:0;background:#08070d;color:#f7f4ff;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:40px 24px"><p style="color:#c8a8ff;letter-spacing:2px;font-size:12px">PROJECT GALAXY</p><h1>Tu acceso está listo</h1><p style="color:#c9c3d6;line-height:1.65">Fuiste invitado con la membresía <strong>' + escapeHtml_(planName) + '</strong>. Este enlace vence en 7 minutos.</p><p style="margin:32px 0"><a href="' + escapeHtml_(link) + '" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#9b6cff;color:#fff;text-decoration:none;font-weight:700">Completar registro</a></p><p style="color:#777181;font-size:12px">El enlace es personal y solo puede utilizarse una vez.</p></div></body></html>',
    });
    cache.put(fingerprint, 'sent', 420);
    return jsonOutput_({ ok: true, expiresAt: invitation.expires_at });
  } finally { lock.releaseLock(); }
}

function verifyRegistrationInvitation_(token) {
  const response = UrlFetchApp.fetch(GALAXY_SUPABASE_URL + '/rest/v1/rpc/get_registration_invitation', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: GALAXY_SUPABASE_ANON_KEY, Authorization: 'Bearer ' + GALAXY_SUPABASE_ANON_KEY },
    payload: JSON.stringify({ p_token: token }),
    muteHttpExceptions: true,
  });
  let result;
  try { result = JSON.parse(response.getContentText() || '{}'); } catch (error) { result = {}; }
  if (response.getResponseCode() !== 200 || !result.email) {
    throw new Error(String(result.message || 'Supabase rechazó o no reconoce esta invitación.'));
  }
  return result;
}
