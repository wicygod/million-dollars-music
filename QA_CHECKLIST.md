# Music Platform QA Checklist

1. Open the app: playback is paused, timer is `0:00`, and the Play icon is shown.
2. Click Play: the current track starts and the timer advances.
3. Click Pause: playback stops and the timer no longer advances.
4. Click Next: the next track in the current queue opens.
5. Click Prev near the beginning of a track: the previous track opens.
6. Pause playback and click Next rapidly 10 times: playback remains paused.
7. Seek on the timeline: the current time and progress bar update.
8. Change volume: the slider and audible level update.
9. Click mute and unmute: volume goes to zero, then returns to the previous level.
10. Search for `Queen`: results appear and `Queen` remains in the search box.
11. Like a track and open Favorites: only liked tracks are shown, without the empty state.
12. Create a playlist with a non-empty unique name: it appears in the sidebar and opens.
13. Reload the app: the created playlist is still present.
14. Add the current track to a playlist: the track appears in that playlist.
15. Remove a track from a user playlist: it disappears immediately and the count updates.
16. Open the add-to-playlist popup at `1280x720`: every menu item is visible and clickable.
