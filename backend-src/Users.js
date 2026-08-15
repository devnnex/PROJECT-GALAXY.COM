function getUserProfile_(context, requestedUserId) {
  var userId = requestedUserId || context.user.id;
  if (userId !== context.user.id && ['ADMIN','MODERATOR'].indexOf(context.user.role) < 0) throw apiError_('FORBIDDEN','No puedes acceder a este perfil privado.',403);
  var profile = findRecord_('Profiles','userId',userId);
  return { user:sanitizeUser_(findRecord_('Users','id',userId).data), profile:profile ? profile.data : null };
}

function updateOwnProfile_(context, input) {
  var found = findRecord_('Profiles','userId',context.user.id); if (!found) throw apiError_('NOT_FOUND','No encontramos el perfil.',404);
  return updateRecord_('Profiles',found.rowNumber,{ bio:cleanString_(input.bio,500),cover:cleanString_(input.cover,1000),privacyJson:JSON.stringify(input.privacy || {}),updatedAt:nowIso_() });
}
