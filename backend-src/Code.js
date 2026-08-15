function doGet(e) {
  return routeRequest_('GET', e);
}

function doPost(e) {
  return routeRequest_('POST', e);
}

function routeRequest_(method, e) {
  var requestId = newId_('req');
  var started = Date.now();
  var action = 'unknown';
  beginRequest_();
  try {
    ensureApplicationReady_();
    var body = parseBody_(e);
    action = String((e && e.parameter && e.parameter.action) || body.action || 'health');
    enforceRateLimit_(action, body);
    var handlers = {
      health: function() { return getHealth_(); },
      config: function() { return getPublicConfig_(); },
      register: function() { requireMethod_(method, 'POST'); return registerUser_(body); },
      login: function() { requireMethod_(method, 'POST'); return loginUser_(body); },
      logout: function() { requireMethod_(method, 'POST'); return logoutUser_(requireSession_(body)); },
      me: function() { return sanitizeUser_(requireSession_(body).user); },
      getBootstrapData: function() { return getBootstrapData_(requireSession_(body), body); },
      getProducts: function() { return listProducts_(body); },
      getProduct: function() { return getProduct_(body.id); },
      createOrder: function() { requireMethod_(method, 'POST'); return createOrder_(requireSession_(body), body); },
      createPayment: function() { requireMethod_(method, 'POST'); return createPayment_(requireSession_(body), body); },
      verifyPayment: function() { requireMethod_(method, 'POST'); return verifyPayment_(requireSession_(body), body); },
      paymentWebhook: function() { requireMethod_(method, 'POST'); return handlePaymentWebhook_(body); },
      getOrders: function() { return getOrders_(requireSession_(body)); },
      getWallet: function() { return getWallet_(requireSession_(body)); },
      createMeeting: function() { requireMethod_(method, 'POST'); return createMeeting_(requireSession_(body), body); },
      joinMeeting: function() { requireMethod_(method, 'POST'); return joinMeeting_(requireSession_(body), body); },
      getMyMeetings: function() { return getMyMeetings_(requireSession_(body)); },
      getMeetingState: function() { return getMeetingState_(requireSession_(body), body); },
      admitMeetingParticipant: function() { requireMethod_(method, 'POST'); return updateParticipantAdmission_(requireSession_(body), body, 'ADMITTED'); },
      denyMeetingParticipant: function() { requireMethod_(method, 'POST'); return updateParticipantAdmission_(requireSession_(body), body, 'DENIED'); },
      setMeetingLocked: function() { requireMethod_(method, 'POST'); return setMeetingLocked_(requireSession_(body), body); },
      endMeeting: function() { requireMethod_(method, 'POST'); return endMeeting_(requireSession_(body), body); },
      getCommunityMembers: function() { return listCommunityMembers_(requireSession_(body), body); },
      inviteToMeeting: function() { requireMethod_(method, 'POST'); return inviteToMeeting_(requireSession_(body), body); },
      getMeetingMessages: function() { return getMeetingMessages_(requireSession_(body), body); },
      postMeetingMessage: function() { requireMethod_(method, 'POST'); return postMeetingMessage_(requireSession_(body), body); },
      reactToMeetingMessage: function() { requireMethod_(method, 'POST'); return reactToMeetingMessage_(requireSession_(body), body); },
      pollMeetingRealtime: function() { requireMethod_(method, 'POST'); return pollMeetingRealtime_(requireSession_(body), body); },
      postMeetingSignals: function() { requireMethod_(method, 'POST'); return postMeetingSignals_(requireSession_(body), body); },
      leaveMeetingRealtime: function() { requireMethod_(method, 'POST'); return leaveMeetingRealtime_(requireSession_(body), body); },
      initializeDatabase: function() { requireAdmin_(requireSession_(body)); return initializeDatabase(); }
    };
    if (!handlers[action]) throw apiError_('NOT_FOUND', 'La acción solicitada no existe.', 404);
    var data = handlers[action]();
    var response = jsonResponse_({ ok:true, data:data, requestId:requestId });
    observeRequest_(action, Date.now() - started, true);
    return response;
  } catch (error) {
    var failure = jsonResponse_({ ok:false, error:{ code:error.code || 'INTERNAL_ERROR', message:error.publicMessage || 'No fue posible completar la solicitud.' }, requestId:requestId });
    observeRequest_(action, Date.now() - started, false);
    return failure;
  }
}

function parseBody_(e) {
  var body = {};
  if (e && e.postData && e.postData.contents) {
    try { body = JSON.parse(e.postData.contents); }
    catch (ignore) { throw apiError_('INVALID_JSON', 'El cuerpo de la solicitud no es JSON válido.', 400); }
  }
  if (e && e.parameter) Object.keys(e.parameter).forEach(function(key) { if (body[key] === undefined) body[key] = e.parameter[key]; });
  return body;
}

function jsonResponse_(payload) {
  var serialized = JSON.stringify(payload);
  if (REQUEST_CONTEXT_) REQUEST_CONTEXT_.responseBytes = serialized.length;
  return ContentService.createTextOutput(serialized).setMimeType(ContentService.MimeType.JSON);
}
