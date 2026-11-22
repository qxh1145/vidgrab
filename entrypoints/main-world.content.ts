// T1.4: MAIN world — hook fetch/XHR to detect playlists
export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  allFrames: true,
  main() {
    // placeholder — implemented in T1.4
  },
});
