function calculateCommission_(gross,sellerId,referralCode){
  var rate=Number(getSetting_('COMMISSION_RATE',APP_CONFIG.DEFAULT_COMMISSION_RATE));
  if(!isFinite(rate)||rate<0||rate>1)throw apiError_('INVALID_COMMISSION_CONFIG','La configuración de comisiones no es válida.',503);
  var referralRate=0; var platform=roundMoney_(gross*rate); var referral=roundMoney_(gross*referralRate); return{ruleId:'default-v1',grossAmount:roundMoney_(gross),platformAmount:platform,sellerAmount:roundMoney_(gross-platform-referral),referralAmount:referral};
}
function roundMoney_(value){return Math.round((Number(value)+Number.EPSILON)*1000000)/1000000;}
