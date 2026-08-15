function createPayment_(context,input){
  var order=findRecord_('Orders','id',cleanString_(input.orderId,100)); if(!order||order.data.buyerId!==context.user.id)throw apiError_('ORDER_NOT_FOUND','No encontramos una orden propia con ese ID.',404);
  if(order.data.status!=='AWAITING_PAYMENT')throw apiError_('ORDER_STATE_INVALID','La orden no acepta un nuevo pago.',409);
  var network=cleanString_(input.network,20).toUpperCase(); assert_(['TRC20','ERC20'].indexOf(network)>=0,'NETWORK_INVALID','Selecciona TRC20 o ERC20.');
  var idem=cleanString_(input.idempotencyKey,120);assert_(idem.length>=12,'IDEMPOTENCY_REQUIRED','Esta operación requiere una clave de idempotencia.');
  var existing=findRecord_('Payments','idempotencyKey',context.user.id+':'+idem);if(existing)return sanitizePayment_(existing.data);
  var provider=getCryptoPaymentProvider_(network); // Fails closed until a real adapter is registered.
  var request=provider.createPaymentRequest({orderId:order.data.id,amount:Number(order.data.subtotal),currency:order.data.currency,network:network,expiresInMinutes:Number(getSetting_('PAYMENT_EXPIRATION_MINUTES',30))});
  var now=nowIso_();var payment={id:newId_('pay'),orderId:order.data.id,provider:provider.name,providerPaymentId:request.id,network:network,tokenContract:request.tokenContract,destinationAddress:validateNetworkAddress_(network,request.address),expectedAmount:Number(order.data.subtotal),currency:order.data.currency,transactionHash:'',confirmations:0,status:'PENDING',expiresAt:request.expiresAt,confirmedAt:'',idempotencyKey:context.user.id+':'+idem,createdAt:now,updatedAt:now,schemaVersion:1};insertRecord_('Payments',payment);updateRecord_('Orders',order.rowNumber,{network:network,updatedAt:now});return sanitizePayment_(payment);
}

function verifyPayment_(context,input){
  var found=findRecord_('Payments','id',cleanString_(input.paymentId,100));if(!found)throw apiError_('PAYMENT_NOT_FOUND','No encontramos el pago.',404);var order=findRecord_('Orders','id',found.data.orderId);if(!order||order.data.buyerId!==context.user.id)throw apiError_('PAYMENT_NOT_FOUND','No encontramos un pago propio con ese ID.',404);
  if(found.data.status==='CONFIRMED')return sanitizePayment_(found.data);if(new Date(found.data.expiresAt)<new Date()){updateRecord_('Payments',found.rowNumber,{status:'EXPIRED',updatedAt:nowIso_()});throw apiError_('PAYMENT_EXPIRED','La solicitud de pago expiró.',409);}
  var provider=getCryptoPaymentProvider_(found.data.network);var verification=provider.verifyPayment(found.data.providerPaymentId);return finalizeVerifiedPayment_(found,order,verification);
}

function finalizeVerifiedPayment_(paymentFound,orderFound,verification){
  validateVerifiedTransfer_(paymentFound.data,verification);var lock=LockService.getScriptLock();lock.waitLock(30000);try{var current=findRecord_('Payments','id',paymentFound.data.id);if(current.data.status==='CONFIRMED')return sanitizePayment_(current.data);var now=nowIso_();var payment=updateRecord_('Payments',current.rowNumber,{transactionHash:verification.transactionHash,confirmations:verification.confirmations,status:'CONFIRMED',confirmedAt:now,updatedAt:now});updateRecord_('Orders',orderFound.rowNumber,{status:'COMPLETED',updatedAt:now});grantOrderAccess_(orderFound.data);settleCommission_(orderFound.data);insertRecord_('Transactions',{id:newId_('txn'),userId:orderFound.data.buyerId,type:'PURCHASE',referenceType:'Order',referenceId:orderFound.data.id,amount:-Number(orderFound.data.subtotal),currency:orderFound.data.currency,network:paymentFound.data.network,transactionHash:verification.transactionHash,status:'CONFIRMED',createdAt:now,schemaVersion:1});return sanitizePayment_(payment);}finally{lock.releaseLock();}
}
function sanitizePayment_(p){return{id:p.id,orderId:p.orderId,network:p.network,token:'USDT',destinationAddress:p.destinationAddress,expectedAmount:Number(p.expectedAmount),currency:p.currency,transactionHash:p.transactionHash,status:p.status,expiresAt:p.expiresAt,confirmedAt:p.confirmedAt};}

function handlePaymentWebhook_(input){
  var providerName=cleanString_(input.provider,80);var eventId=cleanString_(input.eventId,150);assert_(providerName&&eventId,'WEBHOOK_INVALID','El webhook no incluye sus identificadores.');
  if(findRecord_('WebhookEvents','eventId',providerName+':'+eventId))return{received:true,duplicate:true};
  throw apiError_('WEBHOOK_PROVIDER_NOT_CONFIGURED','No existe un verificador de firma instalado para este proveedor.',503);
}
