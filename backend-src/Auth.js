function hashPassword_(password, salt) {
  var pepper = PropertiesService.getScriptProperties().getProperty('PASSWORD_PEPPER');
  if (!pepper) { ensureApplicationReady_(); pepper = PropertiesService.getScriptProperties().getProperty('PASSWORD_PEPPER'); }
  if (!pepper) throw apiError_('SECURITY_NOT_CONFIGURED', 'No fue posible inicializar la seguridad de autenticación.', 503);
  var output = String(password) + ':' + salt + ':' + pepper;
  for (var i = 0; i < APP_CONFIG.PASSWORD_HASH_ROUNDS; i++) output = sha256_(output + ':' + i);
  return output;
}

function registerUser_(input) {
  if (!getBooleanSetting_('REGISTRATION_ENABLED', true)) throw apiError_('REGISTRATION_DISABLED', 'El registro está temporalmente desactivado.', 403);
  var name = cleanString_(input.name, 100); var username = cleanString_(input.username, 32).toLowerCase(); var email = normalizeEmail_(input.email); var password = String(input.password || '');
  assert_(name.length >= 2, 'INVALID_NAME', 'Ingresa un nombre válido.');
  assert_(/^[a-z0-9_]{3,32}$/.test(username), 'INVALID_USERNAME', 'El usuario debe tener 3–32 caracteres: letras, números o guion bajo.');
  assert_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'INVALID_EMAIL', 'Ingresa un correo válido.');
  assert_(password.length >= 10, 'WEAK_PASSWORD', 'La contraseña debe tener al menos 10 caracteres.');
  if (findRecord_('Users','email',email)) throw apiError_('EMAIL_EXISTS', 'Ya existe una cuenta con este correo.', 409);
  if (findRecord_('Users','username',username)) throw apiError_('USERNAME_EXISTS', 'Ese nombre de usuario ya está ocupado.', 409);
  var salt = randomToken_(); var now = nowIso_();
  var user = { id:newId_('usr'),name:name,username:username,email:email,passwordHash:hashPassword_(password,salt),passwordSalt:salt,avatar:'',createdAt:now,updatedAt:now,status:'ACTIVE',role:'USER',level:1,lastLogin:'',emailVerifiedAt:'',schemaVersion:1 };
  insertRecord_('Users', user); insertRecord_('Profiles',{ id:newId_('pro'),userId:user.id,cover:'',bio:'',xp:0,followersCount:0,followingCount:0,privacyJson:'{}',createdAt:now,updatedAt:now,schemaVersion:1 });
  insertRecord_('Wallets',{ id:newId_('wal'),userId:user.id,availableBalance:0,pendingBalance:0,totalEarned:0,totalSpent:0,currency:'USDT',updatedAt:now,schemaVersion:1 });
  logSecurityEvent_(user.id,'REGISTER','INFO','User',user.id,{});
  return createSession_(user);
}

function loginUser_(input) {
  var email = normalizeEmail_(input.email); var password = String(input.password || '');
  var found = findRecord_('Users','email',email);
  if (!found || !constantTimeEqual_(hashPassword_(password, found ? found.data.passwordSalt : 'invalid-salt'), found ? found.data.passwordHash : sha256_('invalid'))) {
    logSecurityEvent_('', 'LOGIN_FAILED', 'WARNING', 'User', '', { emailHash: sha256_(email) });
    throw apiError_('INVALID_CREDENTIALS', 'El correo o la contraseña no coinciden.', 401);
  }
  if (found.data.status !== 'ACTIVE') throw apiError_('ACCOUNT_UNAVAILABLE', 'La cuenta no está activa.', 403);
  var now = nowIso_(); updateRecord_('Users', found.rowNumber, { lastLogin:now,updatedAt:now });
  logSecurityEvent_(found.data.id,'LOGIN','INFO','User',found.data.id,{});
  return createSession_(found.data);
}

function createSession_(user) {
  var rawToken = randomToken_(); var now = new Date(); var expires = new Date(now.getTime() + APP_CONFIG.SESSION_DURATION_SECONDS * 1000);
  insertRecord_('Sessions',{ id:newId_('ses'),userId:user.id,tokenHash:sha256_(rawToken),createdAt:now.toISOString(),expiresAt:expires.toISOString(),revokedAt:'',lastSeenAt:now.toISOString(),userAgentHash:'',schemaVersion:1 });
  return { token:rawToken,user:sanitizeUser_(user),expiresAt:expires.getTime() };
}

function requireSession_(input) {
  var token = cleanString_(input.sessionToken || input.token, 300);
  if (!token) throw apiError_('AUTH_REQUIRED', 'Inicia sesión para continuar.', 401);
  var found = findRecord_('Sessions','tokenHash',sha256_(token));
  if (!found || found.data.revokedAt || new Date(found.data.expiresAt).getTime() <= Date.now()) throw apiError_('SESSION_INVALID', 'Tu sesión expiró o fue revocada.', 401);
  var user = findRecord_('Users','id',found.data.userId);
  if (!user || user.data.status !== 'ACTIVE') throw apiError_('SESSION_INVALID', 'La cuenta no está disponible.', 401);
  if(!found.data.lastSeenAt||Date.now()-new Date(found.data.lastSeenAt).getTime()>300000)updateRecord_('Sessions', found.rowNumber, { lastSeenAt:nowIso_() });
  return { session:found.data,user:user.data };
}

function logoutUser_(context) { var found = findRecord_('Sessions','id',context.session.id); if (found) updateRecord_('Sessions',found.rowNumber,{ revokedAt:nowIso_() }); logSecurityEvent_(context.user.id,'LOGOUT','INFO','Session',context.session.id,{}); return { loggedOut:true }; }
function sanitizeUser_(user) { return { id:user.id,name:user.name,username:user.username,email:user.email,avatar:user.avatar,role:user.role,level:Number(user.level || 1),status:user.status,createdAt:user.createdAt,emailVerified:!!user.emailVerifiedAt }; }
function requireAdmin_(context) { if (context.user.role !== 'ADMIN') throw apiError_('FORBIDDEN','No tienes permiso para realizar esta acción.',403); return context; }
function constantTimeEqual_(a,b) { a=String(a); b=String(b); var mismatch=a.length^b.length; var length=Math.max(a.length,b.length); for(var i=0;i<length;i++) mismatch|=(a.charCodeAt(i%Math.max(a.length,1))||0)^(b.charCodeAt(i%Math.max(b.length,1))||0); return mismatch===0; }

function bootstrapAdmin_() {
  var email = normalizeEmail_(PropertiesService.getScriptProperties().getProperty('BOOTSTRAP_ADMIN_EMAIL'));
  if (!email || findRecord_('Users','email',email)) return;
  var temporaryPassword = PropertiesService.getScriptProperties().getProperty('BOOTSTRAP_ADMIN_PASSWORD');
  if (!temporaryPassword || temporaryPassword.length < 14) { console.warn('Admin bootstrap skipped: set a strong BOOTSTRAP_ADMIN_PASSWORD temporarily.'); return; }
  var salt=randomToken_(), now=nowIso_();
  insertRecord_('Users',{ id:newId_('usr'),name:'Platform Administrator',username:'admin_'+Utilities.getUuid().slice(0,6),email:email,passwordHash:hashPassword_(temporaryPassword,salt),passwordSalt:salt,avatar:'',createdAt:now,updatedAt:now,status:'ACTIVE',role:'ADMIN',level:1,lastLogin:'',emailVerifiedAt:now,schemaVersion:1 });
  PropertiesService.getScriptProperties().deleteProperty('BOOTSTRAP_ADMIN_PASSWORD');
}
