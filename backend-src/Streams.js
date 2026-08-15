function createStream_(context,input){
  if(!getBooleanSetting_('STREAMING_ENABLED',false))throw apiError_('STREAMING_NOT_CONFIGURED','El streaming requiere configurar señalización, TURN y un SFU.',503);
  if(['CREATOR','ADMIN'].indexOf(context.user.role)<0)throw apiError_('FORBIDDEN','Tu rol no puede iniciar transmisiones.',403);
  var transport=PropertiesService.getScriptProperties().getProperty('STREAMING_PROVIDER');if(!transport)throw apiError_('STREAMING_NOT_CONFIGURED','Configura un proveedor de transporte antes de iniciar.',503);
  return insertRecord_('Streams',{id:newId_('str'),hostId:context.user.id,title:cleanString_(input.title,140),description:cleanString_(input.description,1000),thumbnail:cleanString_(input.thumbnail,1000),categoryId:cleanString_(input.categoryId,100),status:'CREATED',startedAt:'',endedAt:'',viewerCount:0,createdAt:nowIso_(),schemaVersion:1});
}
