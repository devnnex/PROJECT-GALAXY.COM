var REQUEST_CONTEXT_ = null;

function beginRequest_() { REQUEST_CONTEXT_ = { sheetReads:0, sheetWrites:0, cacheHits:0, recordCache:{}, listCache:{}, responseBytes:0 }; }
function metric_(key, amount) { if (REQUEST_CONTEXT_) REQUEST_CONTEXT_[key] = Number(REQUEST_CONTEXT_[key] || 0) + Number(amount || 1); }
function invalidateRequestData_(sheetName) { if (!REQUEST_CONTEXT_) return; delete REQUEST_CONTEXT_.listCache[sheetName]; REQUEST_CONTEXT_.recordCache = {}; }

function getDatabase_() {
  var properties = PropertiesService.getScriptProperties();
  var id = properties.getProperty('SPREADSHEET_ID');
  var spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) spreadsheet = SpreadsheetApp.create(APP_CONFIG.APP_NAME + ' - Database');
  if (!id) properties.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  return spreadsheet;
}

function getSchemaFingerprint_() { return sha256_(JSON.stringify(SHEET_SCHEMAS)); }

function ensureSecurityProperties_() {
  var properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('PASSWORD_PEPPER')) properties.setProperty('PASSWORD_PEPPER', randomToken_() + randomToken_());
  if (!properties.getProperty('MEETING_TOKEN_SECRET')) properties.setProperty('MEETING_TOKEN_SECRET', randomToken_() + randomToken_());
}

function ensureApplicationReady_() {
  var properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('PASSWORD_PEPPER') || !properties.getProperty('MEETING_TOKEN_SECRET') || properties.getProperty('DATABASE_SCHEMA_FINGERPRINT') !== getSchemaFingerprint_()) initializeDatabase();
}

function initializeDatabase() {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var spreadsheet = getDatabase_(); var report = { created: [], migrated: [], unchanged: [] };
    Object.keys(SHEET_SCHEMAS).forEach(function(name) {
      var schema = SHEET_SCHEMAS[name]; var sheet = spreadsheet.getSheetByName(name);
      if (!sheet) { sheet = spreadsheet.insertSheet(name); sheet.getRange(1, 1, 1, schema.length).setValues([schema]); sheet.setFrozenRows(1); styleHeader_(sheet, schema.length); report.created.push(name); return; }
      var lastColumn = Math.max(sheet.getLastColumn(), 1); var existing = sheet.getLastRow() ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].filter(String) : [];
      if (!existing.length) { sheet.getRange(1, 1, 1, schema.length).setValues([schema]); styleHeader_(sheet, schema.length); report.migrated.push(name); return; }
      var missing = schema.filter(function(column) { return existing.indexOf(column) === -1; });
      if (missing.length) { sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]); styleHeader_(sheet, existing.length + missing.length); report.migrated.push(name); } else report.unchanged.push(name);
    });
    ensureSecurityProperties_(); seedSettings_(); bootstrapAdmin_();
    PropertiesService.getScriptProperties().setProperties({
      DATABASE_SCHEMA_VERSION: APP_CONFIG.DATABASE_SCHEMA_VERSION,
      DATABASE_SCHEMA_FINGERPRINT: getSchemaFingerprint_(),
      SPREADSHEET_ID: spreadsheet.getId()
    }, false);
    report.spreadsheetId = spreadsheet.getId();
    return report;
  } finally { lock.releaseLock(); }
}

function styleHeader_(sheet, columns) { sheet.getRange(1, 1, 1, columns).setFontWeight('bold').setBackground('#17121f').setFontColor('#f4efff'); }
function newId_(prefix) { return prefix + '_' + Utilities.getUuid().replace(/-/g, ''); }
function nowIso_() { return new Date().toISOString(); }
function apiError_(code, message, status) { var error = new Error(message); error.code = code; error.publicMessage = message; error.status = status || 400; return error; }
function requireMethod_(actual, expected) { if (actual !== expected) throw apiError_('METHOD_NOT_ALLOWED', 'Método no permitido.', 405); }
function cleanString_(value, max) { return String(value || '').trim().slice(0, max || 500); }
function normalizeEmail_(value) { return cleanString_(value, 254).toLowerCase(); }
function assert_(condition, code, message) { if (!condition) throw apiError_(code, message, 400); }
function randomToken_() { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + ':' + Date.now() + ':' + Math.random())).replace(/=+$/, ''); }
function sha256_(value) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value))).replace(/=+$/, ''); }

function getHeaders_(sheet) { if (!sheet || sheet.getLastRow() < 1) return []; metric_('sheetReads'); return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]; }
function rowToObject_(headers, row) { var result = {}; headers.forEach(function(key, i) { if (key) result[key] = row[i]; }); return result; }
function objectToRow_(headers, object) { return headers.map(function(key) { return object[key] === undefined ? '' : object[key]; }); }
function findRecord_(sheetName, column, value) {
  var cacheKey=sheetName+':'+column+':'+String(value);if(REQUEST_CONTEXT_&&Object.prototype.hasOwnProperty.call(REQUEST_CONTEXT_.recordCache,cacheKey)){metric_('cacheHits');return REQUEST_CONTEXT_.recordCache[cacheKey];}
  var sheet = getDatabase_().getSheetByName(sheetName); if (!sheet || sheet.getLastRow() < 2) return null;
  var headers = getHeaders_(sheet); var index = headers.indexOf(column); if (index < 0) throw new Error('Missing column: ' + column);
  metric_('sheetReads');
  var match = sheet.getRange(2, index + 1, sheet.getLastRow() - 1, 1).createTextFinder(String(value)).matchEntireCell(true).findNext();
  if (!match){if(REQUEST_CONTEXT_)REQUEST_CONTEXT_.recordCache[cacheKey]=null;return null;}metric_('sheetReads');var result={ rowNumber: match.getRow(), data: rowToObject_(headers, sheet.getRange(match.getRow(), 1, 1, headers.length).getValues()[0]) };if(REQUEST_CONTEXT_)REQUEST_CONTEXT_.recordCache[cacheKey]=result;return result;
}
function insertRecord_(sheetName, object) { var sheet = getDatabase_().getSheetByName(sheetName); if (!sheet) throw new Error('Database not initialized'); var headers = getHeaders_(sheet); sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([objectToRow_(headers, object)]);metric_('sheetWrites');invalidateRequestData_(sheetName); return object; }
function updateRecord_(sheetName, rowNumber, patch) { var sheet = getDatabase_().getSheetByName(sheetName); var headers = getHeaders_(sheet);metric_('sheetReads'); var row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0]; Object.keys(patch).forEach(function(key) { var i = headers.indexOf(key); if (i >= 0) row[i] = patch[key]; }); sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);metric_('sheetWrites');invalidateRequestData_(sheetName); return rowToObject_(headers, row); }
function listRecords_(sheetName) { if(REQUEST_CONTEXT_&&Object.prototype.hasOwnProperty.call(REQUEST_CONTEXT_.listCache,sheetName)){metric_('cacheHits');return REQUEST_CONTEXT_.listCache[sheetName];}var sheet = getDatabase_().getSheetByName(sheetName); if (!sheet || sheet.getLastRow() < 2){if(REQUEST_CONTEXT_)REQUEST_CONTEXT_.listCache[sheetName]=[];return [];} var headers = getHeaders_(sheet);metric_('sheetReads');var records=sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function(row) { return rowToObject_(headers, row); });if(REQUEST_CONTEXT_)REQUEST_CONTEXT_.listCache[sheetName]=records;return records; }
function getSettingsMap_(){var cache=CacheService.getScriptCache();var cached=cache.get('settings:all');if(cached){metric_('cacheHits');try{return JSON.parse(cached);}catch(ignore){}}var map={};listRecords_('Settings').forEach(function(row){if(String(row.isSecret).toLowerCase()!=='true')map[row.key]=row.value;});cache.put('settings:all',JSON.stringify(map),300);return map;}
function getSetting_(key, fallback) { var settings=getSettingsMap_();return Object.prototype.hasOwnProperty.call(settings,key)?settings[key]:fallback; }
function getBooleanSetting_(key, fallback) { return String(getSetting_(key, fallback)).toLowerCase() === 'true'; }
function seedSettings_() { var defaults = { APP_NAME: APP_CONFIG.APP_NAME, REGISTRATION_ENABLED: true, MARKETPLACE_ENABLED: true, MEETINGS_ENABLED: true, STREAMING_ENABLED: false, MAINTENANCE_MODE: false, COMMISSION_RATE: APP_CONFIG.DEFAULT_COMMISSION_RATE, PAYMENT_EXPIRATION_MINUTES: 30, TRC20_ENABLED: false, ERC20_ENABLED: false, MINIMUM_WITHDRAWAL: 10 };var existing={};listRecords_('Settings').forEach(function(row){existing[row.key]=true;});Object.keys(defaults).forEach(function(key) { if (!existing[key]) insertRecord_('Settings',{ key:key,value:String(defaults[key]),type:typeof defaults[key],isSecret:false,updatedBy:'system',updatedAt:nowIso_(),schemaVersion:1 }); });CacheService.getScriptCache().remove('settings:all'); }
function observeRequest_(action, duration, ok) { var metrics=REQUEST_CONTEXT_||{};console.log(JSON.stringify({ type:'api_request',action:action,durationMs:duration,ok:ok,sheetReads:metrics.sheetReads||0,sheetWrites:metrics.sheetWrites||0,cacheHits:metrics.cacheHits||0,responseBytes:metrics.responseBytes||0 })); }
