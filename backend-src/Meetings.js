function findMeetingByInput_(input){
  if(input.meetingId)return findRecord_('Meetings','id',cleanString_(input.meetingId,100));
  var code=cleanString_(input.roomCode,100).toUpperCase();
  return code?findRecord_('Meetings','roomCodeHash',sha256_(code)):null;
}

function requireMeetingMember_(context,meeting){
  if(!meeting)throw apiError_('MEETING_NOT_FOUND','La sala no existe o ya terminó.',404);
  var participant=listRecords_('MeetingParticipants').filter(function(item){return item.meetingId===meeting.data.id&&item.userId===context.user.id&&item.status!=='DENIED';})[0];
  if(context.user.id!==meeting.data.hostId&&!participant)throw apiError_('FORBIDDEN','No perteneces a esta reunión.',403);
  return participant||{role:'HOST',status:'ADMITTED'};
}

function requireMeetingHost_(context,meeting){
  if(!meeting||meeting.data.hostId!==context.user.id)throw apiError_('FORBIDDEN','Solo el anfitrión puede realizar esta acción.',403);
  return meeting;
}

function meetingSummary_(meeting,context){
  return{id:meeting.id,title:meeting.title,roomCode:meeting.roomCode||'',status:meeting.status,waitingRoom:String(meeting.waitingRoom)==='true'||meeting.waitingRoom===true,locked:String(meeting.locked)==='true'||meeting.locked===true,host:meeting.hostId===context.user.id,hostId:meeting.hostId,startsAt:meeting.startsAt,endedAt:meeting.endedAt||''};
}

function uniqueRoomCode_(){
  for(var attempt=0;attempt<8;attempt++){var raw=randomToken_().replace(/[^A-Za-z0-9]/g,'').slice(0,8).toUpperCase();var code=raw.slice(0,4)+'-'+raw.slice(4,8);if(!findRecord_('Meetings','roomCodeHash',sha256_(code)))return code;}
  throw apiError_('ROOM_CODE_UNAVAILABLE','No fue posible generar un código de reunión.',503);
}

function createMeeting_(context,input){
  if(!getBooleanSetting_('MEETINGS_ENABLED',true))throw apiError_('MEETINGS_DISABLED','Las reuniones están temporalmente desactivadas.',503);
  var rawCode=uniqueRoomCode_();var rawPassword=cleanString_(input.password,100);var salt=randomToken_();var now=nowIso_();
  var meeting={id:newId_('mtg'),hostId:context.user.id,roomCode:rawCode,roomCodeHash:sha256_(rawCode),passwordHash:rawPassword?hashPassword_(rawPassword,salt)+':'+salt:'',title:cleanString_(input.title,140)||'Reunión de '+context.user.name,waitingRoom:input.waitingRoom!==false,locked:false,permissionsJson:JSON.stringify({screenShare:'ALL',chat:true,reactions:true,hostCanMute:true}),status:'ACTIVE',startsAt:now,endedAt:'',createdAt:now,updatedAt:now,schemaVersion:1};
  insertRecord_('Meetings',meeting);insertRecord_('MeetingParticipants',{id:newId_('mtp'),meetingId:meeting.id,userId:context.user.id,role:'HOST',status:'ADMITTED',joinedAt:now,leftAt:'',permissionsJson:'{}',schemaVersion:1});
  logSecurityEvent_(context.user.id,'MEETING_CREATED','INFO','Meeting',meeting.id,{});
  return meetingSummary_(meeting,context);
}

function joinMeeting_(context,input){
  var meeting=findMeetingByInput_(input);if(!meeting||meeting.data.status==='ENDED')throw apiError_('MEETING_NOT_FOUND','La sala no existe o ya terminó.',404);
  var isHost=context.user.id===meeting.data.hostId;
  if(!isHost&&(meeting.data.locked===true||String(meeting.data.locked)==='true'))throw apiError_('MEETING_LOCKED','La sala está bloqueada por el anfitrión.',403);
  if(meeting.data.passwordHash&&!isHost){var parts=String(meeting.data.passwordHash).split(':');var salt=parts.pop();var expected=parts.join(':');if(!constantTimeEqual_(hashPassword_(String(input.password||''),salt),expected))throw apiError_('MEETING_PASSWORD_INVALID','La contraseña de la sala no coincide.',401);}
  var participants=listRecords_('MeetingParticipants');var participant=participants.filter(function(p){return p.meetingId===meeting.data.id&&p.userId===context.user.id;})[0];
  var waiting=meeting.data.waitingRoom===true||String(meeting.data.waitingRoom)==='true';var previousStatus=participant?participant.status:'';var status=isHost?'ADMITTED':(previousStatus==='INVITED'?(waiting?'WAITING':'ADMITTED'):(participant?previousStatus:(waiting?'WAITING':'ADMITTED')));var role=isHost?'HOST':'PARTICIPANT';
  if(status==='DENIED')throw apiError_('MEETING_DENIED','El anfitrión no autorizó tu ingreso.',403);
  if(!participant)insertRecord_('MeetingParticipants',{id:newId_('mtp'),meetingId:meeting.data.id,userId:context.user.id,role:role,status:status,joinedAt:status==='ADMITTED'?nowIso_():'',leftAt:'',permissionsJson:'{}',schemaVersion:1});
  else if(status!==previousStatus||(status==='ADMITTED'&&!participant.joinedAt)){var found=findRecord_('MeetingParticipants','id',participant.id);if(found)updateRecord_('MeetingParticipants',found.rowNumber,{status:status,joinedAt:status==='ADMITTED'?nowIso_():participant.joinedAt,leftAt:''});}
  var signaling=PropertiesService.getScriptProperties().getProperty('SIGNALING_URL');
  return{meetingId:meeting.data.id,title:meeting.data.title,roomCode:meeting.data.roomCode||cleanString_(input.roomCode,100).toUpperCase(),hostId:meeting.data.hostId,role:role,status:status,waitingRoom:waiting,locked:String(meeting.data.locked)==='true'||meeting.data.locked===true,signalingConfigured:!!signaling,signalingUrl:signaling||null,meetingToken:status==='ADMITTED'?createMeetingToken_(meeting.data.id,context.user.id,context.user.name,status,role):null,iceServers:getMeetingIceServers_(),messages:status==='ADMITTED'?getMeetingMessages_(context,{meetingId:meeting.data.id,limit:100}):[]};
}

function getMyMeetings_(context){
  var memberships={};listRecords_('MeetingParticipants').forEach(function(item){if(item.userId===context.user.id&&item.status!=='DENIED')memberships[item.meetingId]=true;});
  return listRecords_('Meetings').filter(function(item){return item.hostId===context.user.id||memberships[item.id];}).slice(-40).reverse().map(function(item){return meetingSummary_(item,context);});
}

function getMeetingState_(context,input){
  var meeting=findMeetingByInput_(input);var member=requireMeetingMember_(context,meeting);var result=meetingSummary_(meeting.data,context);result.role=meeting.data.hostId===context.user.id?'HOST':member.role;result.participantStatus=member.status;result.messages=member.status==='ADMITTED'?getMeetingMessages_(context,{meetingId:meeting.data.id,limit:100}):[];
  if(result.host){var users={};listRecords_('Users').forEach(function(item){users[item.id]=item;});result.waitingParticipants=listRecords_('MeetingParticipants').filter(function(item){return item.meetingId===meeting.data.id&&item.status==='WAITING';}).map(function(item){var user=users[item.userId]||{};return{id:item.id,userId:item.userId,name:user.name||'Usuario',username:user.username||'',avatar:user.avatar||''};});}
  return result;
}

function updateParticipantAdmission_(context,input,status){
  var meeting=findMeetingByInput_(input);requireMeetingHost_(context,meeting);assert_(['ADMITTED','DENIED'].indexOf(status)>=0,'INVALID_STATUS','Estado de admisión inválido.');
  var found=findRecord_('MeetingParticipants','id',cleanString_(input.participantId,100));if(!found||found.data.meetingId!==meeting.data.id)throw apiError_('PARTICIPANT_NOT_FOUND','No encontramos a ese participante.',404);
  updateRecord_('MeetingParticipants',found.rowNumber,{status:status,joinedAt:status==='ADMITTED'?nowIso_():'',leftAt:status==='DENIED'?nowIso_():''});
  createNotification_(found.data.userId,'MEETING_'+status,status==='ADMITTED'?'Ingreso autorizado':'Ingreso rechazado',meeting.data.title,'Meeting',meeting.data.id);
  return{participantId:found.data.id,status:status};
}

function setMeetingLocked_(context,input){var meeting=findMeetingByInput_(input);requireMeetingHost_(context,meeting);var locked=Boolean(input.locked);updateRecord_('Meetings',meeting.rowNumber,{locked:locked,updatedAt:nowIso_()});return{locked:locked};}

function endMeeting_(context,input){
  var meeting=findMeetingByInput_(input);requireMeetingHost_(context,meeting);if(meeting.data.status!=='ENDED')updateRecord_('Meetings',meeting.rowNumber,{status:'ENDED',endedAt:nowIso_(),updatedAt:nowIso_()});
  logSecurityEvent_(context.user.id,'MEETING_ENDED','INFO','Meeting',meeting.data.id,{});return{meetingId:meeting.data.id,status:'ENDED'};
}

function listCommunityMembers_(context,input){var query=cleanString_(input.query,80).toLowerCase();return listRecords_('Users').filter(function(item){return item.id!==context.user.id&&item.status==='ACTIVE'&&(!query||(String(item.name)+' '+String(item.username)).toLowerCase().indexOf(query)>=0);}).slice(0,100).map(function(item){return{id:item.id,name:item.name,username:item.username,avatar:item.avatar||''};});}

function inviteToMeeting_(context,input){
  var meeting=findMeetingByInput_(input);requireMeetingHost_(context,meeting);var invitee=findRecord_('Users','id',cleanString_(input.userId,100));if(!invitee||invitee.data.status!=='ACTIVE')throw apiError_('USER_NOT_FOUND','No encontramos a ese usuario activo.',404);if(invitee.data.id===context.user.id)throw apiError_('INVALID_INVITEE','Ya eres el anfitrión de la reunión.',400);
  var existing=listRecords_('MeetingInvitations').filter(function(item){return item.meetingId===meeting.data.id&&item.inviteeId===invitee.data.id;})[0];var invitation;
  if(existing){var found=findRecord_('MeetingInvitations','id',existing.id);invitation=updateRecord_('MeetingInvitations',found.rowNumber,{status:'PENDING',createdAt:nowIso_(),respondedAt:''});}
  else invitation=insertRecord_('MeetingInvitations',{id:newId_('mti'),meetingId:meeting.data.id,inviterId:context.user.id,inviteeId:invitee.data.id,status:'PENDING',createdAt:nowIso_(),respondedAt:'',schemaVersion:1});
  var participant=listRecords_('MeetingParticipants').filter(function(item){return item.meetingId===meeting.data.id&&item.userId===invitee.data.id;})[0];if(!participant)insertRecord_('MeetingParticipants',{id:newId_('mtp'),meetingId:meeting.data.id,userId:invitee.data.id,role:'PARTICIPANT',status:'INVITED',joinedAt:'',leftAt:'',permissionsJson:'{}',schemaVersion:1});
  createNotification_(invitee.data.id,'MEETING_INVITE',context.user.name+' te invitó a una reunión',meeting.data.title+' · '+meeting.data.roomCode,'Meeting',meeting.data.id);
  return{id:invitation.id,userId:invitee.data.id,name:invitee.data.name,status:'PENDING'};
}

function meetingMessageView_(message,users,reactions,viewerId){
  var grouped={};reactions.filter(function(item){return item.messageId===message.id&&String(item.active)!=='false';}).forEach(function(item){if(!grouped[item.emoji])grouped[item.emoji]={emoji:item.emoji,count:0,mine:false};grouped[item.emoji].count++;if(item.userId===viewerId)grouped[item.emoji].mine=true;});var sender=users[message.senderId]||{};
  return{id:message.id,meetingId:message.meetingId,senderId:message.senderId,senderName:sender.name||'Usuario',senderUsername:sender.username||'',body:message.deletedAt?'Mensaje eliminado':message.body,replyToId:message.replyToId||'',createdAt:message.createdAt,reactions:Object.keys(grouped).map(function(key){return grouped[key];})};
}

function getMeetingMessages_(context,input){
  var meeting=findMeetingByInput_(input);var member=requireMeetingMember_(context,meeting);if(member.status!=='ADMITTED')return[];var limit=Math.max(1,Math.min(100,Number(input.limit)||100));var users={};listRecords_('Users').forEach(function(item){users[item.id]=item;});var reactions=listRecords_('MeetingMessageReactions');return listRecords_('MeetingMessages').filter(function(item){return item.meetingId===meeting.data.id;}).slice(-limit).map(function(item){return meetingMessageView_(item,users,reactions,context.user.id);});
}

function postMeetingMessage_(context,input){
  var meeting=findMeetingByInput_(input);var member=requireMeetingMember_(context,meeting);if(meeting.data.status==='ENDED')throw apiError_('MEETING_ENDED','La reunión ya terminó.',409);if(member.status!=='ADMITTED')throw apiError_('MEETING_WAITING','Aún no has sido admitido.',403);var body=cleanString_(input.body,2000);assert_(body.length>0,'EMPTY_MESSAGE','Escribe un mensaje.');var replyToId=cleanString_(input.replyToId,100);if(replyToId){var reply=findRecord_('MeetingMessages','id',replyToId);if(!reply||reply.data.meetingId!==meeting.data.id)throw apiError_('INVALID_REPLY','El mensaje respondido no pertenece a esta reunión.',400);}
  var message=insertRecord_('MeetingMessages',{id:newId_('msg'),meetingId:meeting.data.id,senderId:context.user.id,body:body,replyToId:replyToId,createdAt:nowIso_(),editedAt:'',deletedAt:'',schemaVersion:1});var users={};users[context.user.id]=context.user;return meetingMessageView_(message,users,[],context.user.id);
}

function reactToMeetingMessage_(context,input){
  var meeting=findMeetingByInput_(input);var member=requireMeetingMember_(context,meeting);if(member.status!=='ADMITTED')throw apiError_('MEETING_WAITING','Aún no has sido admitido.',403);var emoji=cleanString_(input.emoji,8);assert_(['👍','👏','❤️','😂','🎉','🔥'].indexOf(emoji)>=0,'INVALID_REACTION','Reacción no permitida.');var message=findRecord_('MeetingMessages','id',cleanString_(input.messageId,100));if(!message||message.data.meetingId!==meeting.data.id)throw apiError_('MESSAGE_NOT_FOUND','No encontramos ese mensaje.',404);var existing=listRecords_('MeetingMessageReactions').filter(function(item){return item.messageId===message.data.id&&item.userId===context.user.id&&item.emoji===emoji;})[0];var active=true;
  if(existing){active=String(existing.active)==='false';var found=findRecord_('MeetingMessageReactions','id',existing.id);updateRecord_('MeetingMessageReactions',found.rowNumber,{active:active,updatedAt:nowIso_()});}else insertRecord_('MeetingMessageReactions',{id:newId_('mmr'),meetingId:meeting.data.id,messageId:message.data.id,userId:context.user.id,emoji:emoji,active:true,createdAt:nowIso_(),updatedAt:nowIso_(),schemaVersion:1});
  return{messageId:message.data.id,emoji:emoji,active:active,userId:context.user.id};
}

function meetingRealtimeKey_(meetingId,suffix){return'mrt:'+sha256_(meetingId).slice(0,20)+':'+suffix;}
function parseCachedJson_(value,fallback){try{return value?JSON.parse(value):fallback;}catch(ignore){return fallback;}}

function pollMeetingRealtime_(context,input){
  var meeting=findMeetingByInput_(input);var member=requireMeetingMember_(context,meeting);if(member.status!=='ADMITTED')throw apiError_('MEETING_WAITING','Aún no has sido admitido.',403);
  var connectionId=cleanString_(input.connectionId,100);assert_(/^[A-Za-z0-9_-]{8,100}$/.test(connectionId),'INVALID_CONNECTION','Identificador de conexión inválido.');var now=Date.now();var cache=CacheService.getScriptCache();var lock=LockService.getScriptLock();var presenceKey=meetingRealtimeKey_(meeting.data.id,'presence');var mailboxKey=meetingRealtimeKey_(meeting.data.id,'box:'+connectionId);var presence;
  lock.waitLock(5000);try{presence=parseCachedJson_(cache.get(presenceKey),{});Object.keys(presence).forEach(function(key){if(now-Number(presence[key].lastSeen||0)>20000)delete presence[key];});var state=input.presence||{};presence[connectionId]={peerId:connectionId,userId:context.user.id,name:context.user.name,role:meeting.data.hostId===context.user.id?'HOST':'PARTICIPANT',mic:Boolean(state.mic),camera:Boolean(state.camera),sharing:Boolean(state.sharing),handRaised:Boolean(state.handRaised),speaking:Boolean(state.mic)&&Boolean(state.speaking),lastSeen:now};cache.put(presenceKey,JSON.stringify(presence),30);}finally{lock.releaseLock();}
  var signals=parseCachedJson_(cache.get(mailboxKey),[]);if(signals.length)cache.remove(mailboxKey);var peers=Object.keys(presence).filter(function(key){return key!==connectionId;}).map(function(key){return presence[key];});var messages=[];if(input.includeMessages===true||String(input.includeMessages)==='true')messages=getMeetingMessages_(context,{meetingId:meeting.data.id,limit:100});
  return{meetingId:meeting.data.id,status:meeting.data.status,peers:peers,signals:signals.slice(-80),messages:messages,serverTime:nowIso_()};
}

function postMeetingSignals_(context,input){
  var meeting=findMeetingByInput_(input);var member=requireMeetingMember_(context,meeting);if(member.status!=='ADMITTED')throw apiError_('MEETING_WAITING','Aún no has sido admitido.',403);var senderId=cleanString_(input.connectionId,100);var signals=Array.isArray(input.signals)?input.signals.slice(0,30):[];var cache=CacheService.getScriptCache();var presence=parseCachedJson_(cache.get(meetingRealtimeKey_(meeting.data.id,'presence')),{});var isHost=meeting.data.hostId===context.user.id;var lock=LockService.getScriptLock();var delivered=0;
  lock.waitLock(5000);try{signals.forEach(function(signal){var type=cleanString_(signal.type,30);if(['offer','answer','ice','reaction','force-mute'].indexOf(type)<0)return;if(type==='force-mute'&&!isHost)return;var targets=[];if(type==='reaction')targets=Object.keys(presence).filter(function(key){return key!==senderId;});else{var target=cleanString_(signal.target,100);if(target&&presence[target])targets=[target];}targets.forEach(function(targetId){var key=meetingRealtimeKey_(meeting.data.id,'box:'+targetId);var mailbox=parseCachedJson_(cache.get(key),[]);var data=signal.data;if(JSON.stringify(data||null).length>30000)return;mailbox.push({id:newId_('sig'),type:type,source:senderId,data:data||null,emoji:cleanString_(signal.emoji,8),by:context.user.name,createdAt:nowIso_()});cache.put(key,JSON.stringify(mailbox.slice(-80)),120);delivered++;});});}finally{lock.releaseLock();}
  return{delivered:delivered};
}

function leaveMeetingRealtime_(context,input){var meeting=findMeetingByInput_(input);requireMeetingMember_(context,meeting);var connectionId=cleanString_(input.connectionId,100);var cache=CacheService.getScriptCache();var key=meetingRealtimeKey_(meeting.data.id,'presence');var lock=LockService.getScriptLock();lock.waitLock(5000);try{var presence=parseCachedJson_(cache.get(key),{});delete presence[connectionId];cache.put(key,JSON.stringify(presence),30);cache.remove(meetingRealtimeKey_(meeting.data.id,'box:'+connectionId));}finally{lock.releaseLock();}return{left:true};}

function createMeetingToken_(meetingId,userId,name,status,role){var expiresAt=Date.now()+60*60*1000;var nonce=randomToken_();var secret=PropertiesService.getScriptProperties().getProperty('MEETING_TOKEN_SECRET');if(!secret)return null;var payload=Utilities.base64EncodeWebSafe(JSON.stringify({meetingId:meetingId,userId:userId,name:name,status:status,role:role||'PARTICIPANT',expiresAt:expiresAt,nonce:nonce})).replace(/=+$/,'');var signature=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload,secret)).replace(/=+$/,'');return payload+'.'+signature;}

function getMeetingIceServers_(){var raw=PropertiesService.getScriptProperties().getProperty('ICE_SERVERS_JSON');if(!raw)return[];try{var parsed=JSON.parse(raw);return Array.isArray(parsed)?parsed.slice(0,5).map(function(item){return{urls:item.urls,username:item.username||'',credential:item.credential||''};}):[];}catch(error){console.error('Invalid ICE_SERVERS_JSON');return[];}}
