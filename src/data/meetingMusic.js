const audioRoot = `${import.meta.env.BASE_URL}audio/meeting/`;

// Add the downloaded files to public/audio/meeting and register them here.
// Keep each id unique and use the exact filename, including its extension.
export const MEETING_MUSIC_TRACKS = [
  // { id: 'song-id', title: 'Song title', artist: 'Artist', file: 'song-file.mp3' },
].map((track) => ({ ...track, src: `${audioRoot}${track.file}` }));

