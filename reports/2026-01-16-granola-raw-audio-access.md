# Quick Research: Granola Raw Audio Access

*Date: 2026-01-16 | Sources: 6*

## Summary

- **Granola does NOT store raw audio files** - Audio is transcribed in real-time and immediately discarded
- **No audio export functionality exists** - Users cannot download or access audio from meetings
- **Temporary caching only on iOS** - Mobile app briefly caches audio for post-meeting transcription, then deletes it
- **Desktop processes audio live** - macOS/Windows apps transcribe immediately with no storage
- **Only transcripts are retained** - Notes and transcripts are stored indefinitely; raw audio is never saved

## Key Sources

- [Granola Help Center - Transcription](https://help.granola.ai/article/transcription): Official documentation confirming audio is not recorded or saved
- [Granola Security Page](https://www.granola.ai/security): Details on data handling - transcribes in real-time, no audio storage
- [Granola Review - tl;dv](https://tldv.io/blog/granola-review/): Third-party confirmation that Granola "doesn't actually record anything"
- [Reverse-Engineering Granola API](https://github.com/getprobo/reverse-engineering-granola-api): Unofficial API documentation - no audio endpoints exist
- [Granola Review - Jamie](https://www.meetjamie.ai/blog/granola-review): Independent review confirming no audio/video storage
- [Granola Review - BlueDot](https://www.bluedothq.com/blog/granola-review): Confirms Granola doesn't provide full transcripts or audio access

## Notable Quotes

> "It does not record or save audio or video at any point during the call, so there's no way to access audio from your meetings." - [Granola Help Center](https://help.granola.ai/article/transcription)

> "Granola temporarily caches audio during the meeting - when transcription is completed, cached audio is deleted from all Granola and third-party systems." - [Granola Help Center](https://help.granola.ai/article/transcription)

> "Granola doesn't store the audio from meetings - it transcribes in real time on macOS/Windows, or after your meeting using temporarily cached audio on iOS." - [Granola Security](https://www.granola.ai/security)

## Technical Details

| Platform | Audio Handling |
|----------|----------------|
| macOS/Windows | Real-time transcription, no storage |
| iOS | Temporary cache during meeting, deleted after transcription |
| Cloud | No audio stored - only encrypted transcripts |

## Implications for the Granola Skill

Since Granola never stores raw audio:

1. **No audio access is possible** via the local cache or API
2. **Transcript is the richest audio-derived data** available
3. **The skill already provides maximum audio-related access** via the `--transcript` flag

## Alternatives If Audio Is Required

If you need raw meeting audio, consider alternatives that do store recordings:
- **tl;dv** - Records and stores audio/video
- **Otter.ai** - Stores audio recordings
- **Fireflies.ai** - Provides audio playback

## Further Research Needed

- Whether Granola has any plans to add optional audio recording in the future
- If there are any third-party tools that can capture audio alongside Granola's transcription
