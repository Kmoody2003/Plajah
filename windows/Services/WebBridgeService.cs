using Microsoft.Web.WebView2.Core;
using System;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Plajah.Windows.Services;

// ── Command shapes received from the web app ───────────────────────────────────
public record BridgeCommand(
    [property: JsonPropertyName("type")]    string? Type,
    [property: JsonPropertyName("title")]   string? Title,
    [property: JsonPropertyName("body")]    string? Body,
    [property: JsonPropertyName("deepLink")]string? DeepLink,
    [property: JsonPropertyName("track")]   string? TrackTitle,
    [property: JsonPropertyName("artist")]  string? ArtistName,
    [property: JsonPropertyName("album")]   string? AlbumTitle,
    [property: JsonPropertyName("artwork")] string? ArtworkUrl,
    [property: JsonPropertyName("playing")] bool    IsPlaying = false,
    [property: JsonPropertyName("view")]    string? View = null
);

// ── COM-visible host object — accessible from JS as window.chrome.webview.hostObjects.plajahNative ──
[ClassInterface(ClassInterfaceType.AutoDual)]
[ComVisible(true)]
public class NativeHostObject
{
    private readonly Action<string> _postToWeb;
    private readonly ToastService   _toast;

    public NativeHostObject(Action<string> postToWeb, ToastService toast)
    {
        _postToWeb = postToWeb;
        _toast     = toast;
    }

    // ── Methods callable from JS ──────────────────────────────────────────────

    /// <summary>Show a Windows toast notification from JavaScript.</summary>
    public void ShowNotification(string title, string body, string deepLink = "")
        => _toast.Show(title, body, string.IsNullOrEmpty(deepLink) ? null : deepLink);

    /// <summary>Get the platform identifier — used by web app for feature detection.</summary>
    public string GetPlatform() => "windows-winui3";

    /// <summary>Get the Windows App SDK version string.</summary>
    public string GetWindowsAppSdkVersion()
        => typeof(Microsoft.UI.Xaml.Application).Assembly.GetName().Version?.ToString() ?? "unknown";

    /// <summary>Request the native media controls to refresh their state.</summary>
    public void RefreshMediaControls()
        => _postToWeb("""{"type":"REQUEST_TRACK_INFO"}""");

    /// <summary>Called by JS when the user's auth state changes — used to update jump list.</summary>
    public void OnAuthStateChanged(string uid, bool isSignedIn)
    {
        // Jump list can be personalized once we know the user
        _ = Task.Run(async () => await new JumpListService().UpdateJumpListAsync(isSignedIn));
    }
}

// ── Bridge service — wires WebView2 messages to native handlers ────────────────
public class WebBridgeService
{
    private readonly CoreWebView2          _coreWebView;
    private readonly SmtcService           _smtc;
    private readonly ToastService          _toast;
    private readonly Action<BridgeCommand> _onCommand;

    public NativeHostObject HostObject { get; }

    private static readonly JsonSerializerOptions _jsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition      = JsonIgnoreCondition.WhenWritingNull,
    };

    public WebBridgeService(
        CoreWebView2 coreWebView,
        SmtcService smtc,
        ToastService toast,
        Action<BridgeCommand> onCommand)
    {
        _coreWebView = coreWebView;
        _smtc        = smtc;
        _toast       = toast;
        _onCommand   = onCommand;

        HostObject = new NativeHostObject(PostToWeb, toast);
    }

    public void HandleIncomingMessage(string json)
    {
        try
        {
            var cmd = JsonSerializer.Deserialize<BridgeCommand>(json, _jsonOpts);
            if (cmd is not null)
                _onCommand(cmd);
        }
        catch (JsonException ex)
        {
            System.Diagnostics.Debug.WriteLine($"[Bridge] JSON parse error: {ex.Message}");
        }
    }

    private void PostToWeb(string json)
        => _coreWebView.PostWebMessageAsString(json);
}
