const audioRoot = `${import.meta.env.BASE_URL}audio/meeting/`;

// Add the downloaded files to public/audio/meeting and register them here.
// Keep each id unique and use the exact filename, including its extension.
export const MEETING_MUSIC_TRACKS = [
  { id: 'pump-it-up', title: 'Pump It Up', file: 'pump-it-up.weba' },
  { id: 'dont-you-cry', title: 'Don’t You Cry', file: 'dont-you-cry.weba' },
].map((track) => ({ ...track, src: `${audioRoot}${track.file}` }));
