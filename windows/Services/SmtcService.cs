using System;
using System.Threading.Tasks;
using Windows.Media;
using Windows.Media.Playback;
using Windows.Storage.Streams;

namespace Plajah.Windows.Services;

/// <summary>
/// Integrates with the Windows System Media Transport Controls (SMTC).
///
/// SMTC powers:
///   • Lock-screen media card with track info + artwork
///   • Hardware/software media keys (play, pause, skip, prev)
///   • Bluetooth headset controls
///   • Windows 11 "Now Playing" flyout in the taskbar
///   • Xbox Game Bar media widget
///
/// The web app owns actual audio playback (via the browser's Audio API).
/// SmtcService acts as a proxy: it tells Windows what's playing and
/// translates button presses into messages posted back to the web app.
/// </summary>
public class SmtcService : IDisposable
{
    private readonly MediaPlayer    _mediaPlayer;
    private readonly SystemMediaTransportControls _smtc;
    private readonly Action<string> _postToWeb;

    public SmtcService(Action<string> postToWeb)
    {
        _postToWeb = postToWeb;

        // A silent MediaPlayer is required to own the SMTC session.
        // We mute it — actual audio is handled by the WebView2.
        _mediaPlayer = new MediaPlayer
        {
            IsLoopingEnabled  = false,
            AudioCategory     = MediaPlayerAudioCategory.Media,
            Volume            = 0, // silent — web app plays the audio
        };

        _smtc = _mediaPlayer.SystemMediaTransportControls;
        _smtc.IsEnabled        = true;
        _smtc.IsPlayEnabled    = true;
        _smtc.IsPauseEnabled   = true;
        _smtc.IsNextEnabled    = true;
        _smtc.IsPreviousEnabled = true;
        _smtc.IsStopEnabled    = true;

        _smtc.ButtonPressed    += OnButtonPressed;
        _smtc.PlaybackPositionChangeRequested += OnSeekRequested;
    }

    // ── Update now-playing info from the web app ──────────────────────────────
    public void UpdateNowPlaying(
        string trackTitle,
        string artistName,
        string albumTitle = "",
        string? artworkUrl = null)
    {
        var updater = _smtc.DisplayUpdater;
        updater.Type         = MediaPlaybackType.Music;
        updater.MusicProperties.Title  = trackTitle;
        updater.MusicProperties.Artist = artistName;
        updater.MusicProperties.AlbumTitle = albumTitle;

        if (!string.IsNullOrEmpty(artworkUrl))
        {
            // Load artwork from URL asynchronously
            _ = LoadArtworkAsync(updater, artworkUrl);
        }
        else
        {
            updater.Thumbnail = null;
        }

        updater.Update();
    }

    public void SetPlaybackState(bool isPlaying, bool isBuffering = false)
    {
        _smtc.PlaybackStatus = isBuffering ? MediaPlaybackStatus.Changing
                             : isPlaying   ? MediaPlaybackStatus.Playing
                                           : MediaPlaybackStatus.Paused;
    }

    public void ClearNowPlaying()
    {
        _smtc.DisplayUpdater.ClearAll();
        _smtc.DisplayUpdater.Update();
        _smtc.PlaybackStatus = MediaPlaybackStatus.Stopped;
    }

    // ── Hardware/software button → web app ────────────────────────────────────
    private void OnButtonPressed(
        SystemMediaTransportControls sender,
        SystemMediaTransportControlsButtonPressedEventArgs args)
    {
        var msg = args.Button switch
        {
            SystemMediaTransportControlsButton.Play       => """{"type":"MEDIA_PLAY"}""",
            SystemMediaTransportControlsButton.Pause      => """{"type":"MEDIA_PAUSE"}""",
            SystemMediaTransportControlsButton.PlayPause  => """{"type":"MEDIA_PLAY_PAUSE"}""",
            SystemMediaTransportControlsButton.Next       => """{"type":"MEDIA_NEXT"}""",
            SystemMediaTransportControlsButton.Previous   => """{"type":"MEDIA_PREV"}""",
            SystemMediaTransportControlsButton.Stop       => """{"type":"MEDIA_STOP"}""",
            _                                              => null,
        };

        if (msg is not null)
            _postToWeb(msg);
    }

    private void OnSeekRequested(
        SystemMediaTransportControls sender,
        PlaybackPositionChangeRequestedEventArgs args)
    {
        var posSeconds = args.RequestedPlaybackPosition.TotalSeconds;
        _postToWeb($$$"""{"type":"MEDIA_SEEK","position":{{{posSeconds}}}}}""");
    }

    // ── Artwork loader ────────────────────────────────────────────────────────
    private static async Task LoadArtworkAsync(
        SystemMediaTransportControlsDisplayUpdater updater,
        string url)
    {
        try
        {
            using var http     = new System.Net.Http.HttpClient();
            var bytes  = await http.GetByteArrayAsync(url).ConfigureAwait(false);
            var stream = new InMemoryRandomAccessStream();
            using (var writer = new DataWriter(stream.GetOutputStreamAt(0)))
            {
                writer.WriteBytes(bytes);
                await writer.StoreAsync().AsTask().ConfigureAwait(false);
            }
            updater.Thumbnail = RandomAccessStreamReference.CreateFromStream(stream);
            updater.Update();
        }
        catch
        {
            // Artwork load failure is non-fatal
        }
    }

    public void Dispose()
    {
        _smtc.ButtonPressed                       -= OnButtonPressed;
        _smtc.PlaybackPositionChangeRequested -= OnSeekRequested;
        _mediaPlayer.Dispose();
    }
}
