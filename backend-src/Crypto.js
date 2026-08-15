function getEnabledNetworks_(){
  var settings=getSettingsMap_();return ['TRC20','ERC20'].filter(function(network){return String(settings[network+'_ENABLED']||'false').toLowerCase()==='true';}).map(function(network){return{network:network,token:'USDT',contractConfigured:!!PropertiesService.getScriptProperties().getProperty('USDT_'+network+'_CONTRACT')};});
}

function getCryptoPaymentProvider_(network){
  var allowed=getEnabledNetworks_().some(function(n){return n.network===network&&n.contractConfigured;});
  if(!allowed)throw apiError_('NETWORK_NOT_CONFIGURED','Esta red no tiene un proveedor y contrato verificados configurados.',503);
  var providerName=PropertiesService.getScriptProperties().getProperty('PAYMENT_PROVIDER_'+network);
  if(!providerName)throw apiError_('PAYMENT_PROVIDER_NOT_CONFIGURED','Configura un proveedor de pagos compatible antes de aceptar fondos.',503);
  // Register audited provider adapters here. Unknown names must fail closed.
  throw apiError_('PAYMENT_PROVIDER_NOT_IMPLEMENTED','El adaptador configurado todavía no está instalado.',503);
}

function validateNetworkAddress_(network,address){
  address=cleanString_(address,150);
  if(network==='ERC20'&&!/^0x[a-fA-F0-9]{40}$/.test(address))throw apiError_('INVALID_ADDRESS','La dirección ERC20 no es válida.',400);
  if(network==='TRC20'&&!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address))throw apiError_('INVALID_ADDRESS','La dirección TRC20 no es válida.',400);
  return address;
}

function validateVerifiedTransfer_(payment,verification){
  var configuredContract=PropertiesService.getScriptProperties().getProperty('USDT_'+payment.network+'_CONTRACT');
  assert_(verification.transactionHash,'TRANSFER_INVALID','Falta el hash de la transacción.');
  assert_(verification.network===payment.network,'TRANSFER_NETWORK_MISMATCH','La red no coincide.');
  assert_(String(verification.tokenContract).toLowerCase()===String(configuredContract).toLowerCase(),'TOKEN_CONTRACT_MISMATCH','El contrato del token no coincide.');
  assert_(String(verification.destinationAddress).toLowerCase()===String(payment.destinationAddress).toLowerCase(),'DESTINATION_MISMATCH','La dirección de destino no coincide.');
  assert_(Number(verification.amount)>=Number(payment.expectedAmount),'AMOUNT_MISMATCH','El importe recibido es insuficiente.');
  assert_(Number(verification.confirmations)>=Number(getSetting_('MIN_CONFIRMATIONS_'+payment.network,12)),'CONFIRMATIONS_PENDING','La transacción aún no tiene suficientes confirmaciones.');
  if(findRecord_('Payments','transactionHash',verification.transactionHash))throw apiError_('TRANSACTION_REUSED','Esta transacción ya fue utilizada.',409);
  return true;
}
