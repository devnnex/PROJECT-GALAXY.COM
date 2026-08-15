function listProducts_(input) {
  if (!getBooleanSetting_('MARKETPLACE_ENABLED',true)) throw apiError_('MARKETPLACE_DISABLED','El marketplace está temporalmente desactivado.',503);
  var query=cleanString_(input.query,100).toLowerCase(); var category=cleanString_(input.category,100);
  return listRecords_('Products').filter(function(p){ return p.status==='PUBLISHED' && (!query || (p.title+' '+p.description).toLowerCase().indexOf(query)>=0) && (!category || p.categoryId===category); }).slice(0,100).map(sanitizeProduct_);
}
function getProduct_(id) { var found=findRecord_('Products','id',cleanString_(id,100)); if(!found || found.data.status!=='PUBLISHED') throw apiError_('PRODUCT_NOT_FOUND','No encontramos este producto.',404); return sanitizeProduct_(found.data); }
function sanitizeProduct_(p) { return { id:p.id,sellerId:p.sellerId,title:p.title,description:p.description,media:parseJsonSafe_(p.mediaJson,[]),price:Number(p.price),currency:p.currency,categoryId:p.categoryId,stock:p.stock===''?null:Number(p.stock),rating:Number(p.rating||0),reviewCount:Number(p.reviewCount||0),createdAt:p.createdAt }; }
function parseJsonSafe_(value,fallback){ try{return JSON.parse(value);}catch(ignore){return fallback;} }

function createReview_(context,input){
  var productId=cleanString_(input.productId,100); var rating=Number(input.rating); assert_(rating>=1&&rating<=5,'INVALID_RATING','La calificación debe estar entre 1 y 5.');
  var ordersById={};listRecords_('Orders').forEach(function(order){ordersById[order.id]=order;});var qualifying=listRecords_('OrderItems').filter(function(item){var order=ordersById[item.orderId];return item.productId===productId&&order&&order.buyerId===context.user.id&&order.status==='COMPLETED';});
  if(!qualifying.length) throw apiError_('PURCHASE_REQUIRED','Solo los compradores verificados pueden reseñar este producto.',403);
  if(findRecord_('Reviews','orderId',qualifying[0].orderId)) throw apiError_('REVIEW_EXISTS','Esta compra ya tiene una reseña.',409);
  return insertRecord_('Reviews',{id:newId_('rev'),productId:productId,userId:context.user.id,orderId:qualifying[0].orderId,rating:rating,body:cleanString_(input.body,2000),status:'PUBLISHED',createdAt:nowIso_(),updatedAt:nowIso_(),schemaVersion:1});
}
