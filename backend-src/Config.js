var APP_CONFIG = Object.freeze({
  APP_NAME: 'PROJECT GALAXY',
  APP_VERSION: '0.1.0',
  DATABASE_SCHEMA_VERSION: '1',
  SESSION_DURATION_SECONDS: 604800,
  PASSWORD_HASH_ROUNDS: 5000,
  PAYMENT_TIMEOUT_MINUTES: 30,
  DEFAULT_COMMISSION_RATE: 0.10,
  PAYMENT_STATES: ['CREATED','PENDING','DETECTING','CONFIRMING','CONFIRMED','FAILED','EXPIRED','REFUNDED','CANCELLED'],
  ROLES: ['USER','CREATOR','SELLER','MODERATOR','ADMIN']
});

var SHEET_SCHEMAS = {
  Users: ['id','name','username','email','passwordHash','passwordSalt','avatar','createdAt','updatedAt','status','role','level','lastLogin','emailVerifiedAt','schemaVersion'],
  Profiles: ['id','userId','cover','bio','xp','followersCount','followingCount','privacyJson','createdAt','updatedAt','schemaVersion'],
  Sessions: ['id','userId','tokenHash','createdAt','expiresAt','revokedAt','lastSeenAt','userAgentHash','schemaVersion'],
  Products: ['id','sellerId','title','description','mediaJson','price','currency','categoryId','stock','status','rating','reviewCount','createdAt','updatedAt','schemaVersion'],
  Orders: ['id','buyerId','sellerId','subtotal','platformFee','sellerNet','currency','network','status','idempotencyKey','createdAt','updatedAt','schemaVersion'],
  OrderItems: ['id','orderId','productId','titleSnapshot','unitPrice','quantity','currency','createdAt','schemaVersion'],
  Payments: ['id','orderId','provider','providerPaymentId','network','tokenContract','destinationAddress','expectedAmount','currency','transactionHash','confirmations','status','expiresAt','confirmedAt','idempotencyKey','createdAt','updatedAt','schemaVersion'],
  Transactions: ['id','userId','type','referenceType','referenceId','amount','currency','network','transactionHash','status','createdAt','schemaVersion'],
  Wallets: ['id','userId','availableBalance','pendingBalance','totalEarned','totalSpent','currency','updatedAt','schemaVersion'],
  Commissions: ['id','orderId','sellerId','ruleId','grossAmount','platformAmount','sellerAmount','referralAmount','currency','status','createdAt','schemaVersion'],
  Withdrawals: ['id','userId','network','address','amount','fee','netAmount','currency','transactionHash','status','createdAt','updatedAt','schemaVersion'],
  Streams: ['id','hostId','title','description','thumbnail','categoryId','status','startedAt','endedAt','viewerCount','createdAt','schemaVersion'],
  Meetings: ['id','hostId','roomCode','roomCodeHash','passwordHash','title','waitingRoom','locked','permissionsJson','status','startsAt','endedAt','createdAt','updatedAt','schemaVersion'],
  MeetingParticipants: ['id','meetingId','userId','role','status','joinedAt','leftAt','permissionsJson','schemaVersion'],
  MeetingInvitations: ['id','meetingId','inviterId','inviteeId','status','createdAt','respondedAt','schemaVersion'],
  MeetingMessages: ['id','meetingId','senderId','body','replyToId','createdAt','editedAt','deletedAt','schemaVersion'],
  MeetingMessageReactions: ['id','meetingId','messageId','userId','emoji','active','createdAt','updatedAt','schemaVersion'],
  Messages: ['id','conversationId','senderId','type','body','attachmentUrl','createdAt','deletedAt','schemaVersion'],
  Notifications: ['id','userId','type','title','body','resourceType','resourceId','readAt','createdAt','schemaVersion'],
  Posts: ['id','authorId','type','body','mediaJson','visibility','premiumProductId','status','createdAt','updatedAt','schemaVersion'],
  Comments: ['id','postId','authorId','parentId','body','status','createdAt','updatedAt','schemaVersion'],
  Likes: ['id','userId','resourceType','resourceId','createdAt','schemaVersion'],
  Reviews: ['id','productId','userId','orderId','rating','body','status','createdAt','updatedAt','schemaVersion'],
  Categories: ['id','name','slug','type','status','createdAt','schemaVersion'],
  Subscriptions: ['id','userId','productId','orderId','period','status','startsAt','expiresAt','createdAt','updatedAt','schemaVersion'],
  AccessGrants: ['id','userId','productId','orderId','grantedAt','expiresAt','status','schemaVersion'],
  SecurityLogs: ['id','userId','event','severity','resourceType','resourceId','ipHash','metadataJson','createdAt','schemaVersion'],
  Settings: ['key','value','type','isSecret','updatedBy','updatedAt','schemaVersion'],
  IdempotencyKeys: ['key','userId','action','resourceId','responseHash','createdAt','expiresAt','schemaVersion'],
  WebhookEvents: ['id','provider','eventId','signatureHash','status','receivedAt','processedAt','schemaVersion']
};

function getPublicConfig_() {
  var settings=getSettingsMap_();function setting(key,fallback){return Object.prototype.hasOwnProperty.call(settings,key)?settings[key]:fallback;}function booleanSetting(key,fallback){return String(setting(key,fallback)).toLowerCase()==='true';}
  return {
    appName: setting('APP_NAME', APP_CONFIG.APP_NAME),
    appVersion: APP_CONFIG.APP_VERSION,
    registrationEnabled: booleanSetting('REGISTRATION_ENABLED', true),
    marketplaceEnabled: booleanSetting('MARKETPLACE_ENABLED', true),
    meetingsEnabled: booleanSetting('MEETINGS_ENABLED', true),
    streamingEnabled: booleanSetting('STREAMING_ENABLED', false),
    maintenanceMode: booleanSetting('MAINTENANCE_MODE', false),
    networks: getEnabledNetworks_()
  };
}
