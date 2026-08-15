function logSecurityEvent_(userId,event,severity,resourceType,resourceId,metadata) {
  try { insertRecord_('SecurityLogs',{ id:newId_('sec'),userId:userId||'',event:event,severity:severity,resourceType:resourceType||'',resourceId:resourceId||'',ipHash:'',metadataJson:JSON.stringify(metadata||{}).slice(0,2000),createdAt:nowIso_(),schemaVersion:1 }); } catch (error) { console.error('Security log failure: '+error.message); }
}

function enforceRateLimit_(action, body) {
  var sensitive = ['login','register','createPayment','verifyPayment','joinMeeting','postMeetingMessage','reactToMeetingMessage','inviteToMeeting','postMeetingSignals']; if (sensitive.indexOf(action) < 0) return;
  var subject = sha256_(cleanString_(body.email || body.sessionToken || 'anonymous',300)); var key='rate:'+action+':'+subject; var cache=CacheService.getScriptCache(); var count=Number(cache.get(key)||0)+1;
  var limit=action==='postMeetingSignals'?180:(action==='postMeetingMessage'||action==='reactToMeetingMessage'?60:20);
  if (count>limit) throw apiError_('RATE_LIMITED','Demasiados intentos. Espera un minuto y vuelve a intentarlo.',429);
  cache.put(key,String(count),60);
}

function getHealth_() { var properties=PropertiesService.getScriptProperties();return { status:'operational',version:APP_CONFIG.APP_VERSION,databaseInitialized:properties.getProperty('DATABASE_SCHEMA_FINGERPRINT')===getSchemaFingerprint_(),securityConfigured:!!properties.getProperty('PASSWORD_PEPPER'),meetingTokensConfigured:!!properties.getProperty('MEETING_TOKEN_SECRET'),signalingConfigured:!!properties.getProperty('SIGNALING_URL'),timestamp:nowIso_() }; }
