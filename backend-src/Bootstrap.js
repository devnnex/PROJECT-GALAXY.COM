function getBootstrapData_(context,input){
  var requested=input.modules;if(typeof requested==='string')requested=requested.split(',');if(!Array.isArray(requested)||!requested.length)requested=['user'];
  var allowed={user:true,config:true,profile:true,wallet:true,notifications:true,orders:true,products:true,meetings:true};var modules=[];requested.forEach(function(name){name=cleanString_(name,30);if(allowed[name]&&modules.indexOf(name)<0)modules.push(name);});
  var result={generatedAt:nowIso_()};
  if(modules.indexOf('user')>=0)result.user=sanitizeUser_(context.user);
  if(modules.indexOf('config')>=0)result.config=getPublicConfig_();
  if(modules.indexOf('profile')>=0){var profile=findRecord_('Profiles','userId',context.user.id);result.profile=profile?profile.data:null;}
  if(modules.indexOf('wallet')>=0){var wallet=findRecord_('Wallets','userId',context.user.id);result.wallet=wallet?{id:wallet.data.id,available:Number(wallet.data.availableBalance),pending:Number(wallet.data.pendingBalance),totalEarned:Number(wallet.data.totalEarned),totalSpent:Number(wallet.data.totalSpent),currency:wallet.data.currency}:null;}
  if(modules.indexOf('notifications')>=0)result.notifications=listRecords_('Notifications').filter(function(item){return item.userId===context.user.id&&!item.readAt;}).slice(-20).reverse();
  if(modules.indexOf('orders')>=0)result.orders=getOrders_(context);
  if(modules.indexOf('products')>=0)result.products=listProducts_(input);
  if(modules.indexOf('meetings')>=0){var participantMeetingIds={};listRecords_('MeetingParticipants').forEach(function(item){if(item.userId===context.user.id&&item.status!=='DENIED')participantMeetingIds[item.meetingId]=true;});result.meetings=listRecords_('Meetings').filter(function(item){return item.hostId===context.user.id||participantMeetingIds[item.id];}).slice(-20).reverse().map(function(item){return{id:item.id,title:item.title,roomCode:item.roomCode||'',status:item.status,startsAt:item.startsAt,host:item.hostId===context.user.id,waitingRoom:String(item.waitingRoom)==='true'||item.waitingRoom===true};});}
  return result;
}
