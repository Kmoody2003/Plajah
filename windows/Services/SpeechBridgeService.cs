using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Windows.Globalization;
using Windows.Media.SpeechRecognition;

namespace Plajah.Windows.Services;

/// <summary>
/// Native speech recognition for Voca (read-aloud) in the Windows desktop app.
///
/// WebView2 does not run the browser's Web Speech recogniser, so the web layer asks the host instead:
///   web → host  { type: "SPEECH_START", lang: "en-US", words: ["the","cat",…] } / SPEECH_STOP / SPEECH_SUSPEND / SPEECH_RESUME
///   host → web  { type: "SPEECH_PARTIAL", text } · { type: "SPEECH_FINAL", text, alts } · { type: "SPEECH_STATE", state, mode }
///               { type: "SPEECH_ERROR", code, message }
///
/// Two recognition modes, chosen automatically:
///   • "dictation"  — open dictation (needs Windows Settings → Privacy → Speech → Online speech recognition);
///   • "passage"    — a list constraint built from the passage's own words: fully offline, no privacy
///                    setting needed, and very accurate for reading because the vocabulary is known.
/// If dictation is unavailable (privacy off, no network) we fall back to passage mode without bothering the child.
/// The session restarts itself when Windows ends it (pauses, timeouts) until the web layer says stop.
/// </summary>
public sealed class SpeechBridgeService : IDisposable
{
    private readonly Action<string> _post;
    private SpeechRecognizer? _rec;
    private bool _active;
    private bool _suspended;
    private string _lang = "en-US";
    private List<string> _words = new();
    private string _mode = "dictation";
    private int _restartsInWindow;
    private DateTime _windowStart = DateTime.UtcNow;

    // HRESULT when "Online speech recognition" privacy is off
    private const int HResultPrivacyDeclined = unchecked((int)0x80045509);

    public SpeechBridgeService(Action<string> postToWeb) { _post = postToWeb; }

    private void Send(object o) => _post(JsonSerializer.Serialize(o));
    private void State(string s) => Send(new { type = "SPEECH_STATE", state = s, mode = _mode });
    private void Error(string code, string message) { Send(new { type = "SPEECH_ERROR", code, message }); State("error"); }

    public async Task StartAsync(string? lang, IEnumerable<string>? words)
    {
        _lang = string.IsNullOrWhiteSpace(lang) ? "en-US" : lang!;
        _words = (words ?? Enumerable.Empty<string>())
            .Select(w => new string(w.Where(c => char.IsLetterOrDigit(c) || c == '\'').ToArray()).ToLowerInvariant())
            .Where(w => w.Length > 0).Distinct().Take(800).ToList();
        _active = true; _suspended = false; _mode = "dictation";
        await SpawnAsync();
    }

    public async Task StopAsync() { _active = false; _suspended = false; await TearDownAsync(); State("idle"); }
    public async Task SuspendAsync() { if (!_active) return; _suspended = true; await TearDownAsync(); State("suspended"); }
    public async Task ResumeAsync() { if (!_active || !_suspended) return; _suspended = false; await SpawnAsync(); }

    private async Task TearDownAsync()
    {
        var r = _rec; _rec = null;
        if (r == null) return;
        try { r.ContinuousRecognitionSession.ResultGenerated -= OnResult; r.ContinuousRecognitionSession.Completed -= OnCompleted; r.HypothesisGenerated -= OnHypothesis; } catch { }
        try { await r.ContinuousRecognitionSession.CancelAsync(); } catch { }
        try { r.Dispose(); } catch { }
    }

    private async Task SpawnAsync()
    {
        if (!_active || _suspended) return;
        await TearDownAsync();
        State("starting");
        try
        {
            var rec = new SpeechRecognizer(new Language(_lang));
            rec.Timeouts.EndSilenceTimeout = TimeSpan.FromSeconds(1.2);
            rec.Timeouts.BabbleTimeout = TimeSpan.FromSeconds(0);
            rec.ContinuousRecognitionSession.AutoStopSilenceTimeout = TimeSpan.FromMinutes(10);
            if (_mode == "passage" && _words.Count > 0)
            {
                // every passage word + adjacent pairs, so connected reading still matches
                var phrases = new List<string>(_words);
                rec.Constraints.Add(new SpeechRecognitionListConstraint(phrases, "passage"));
            }
            else
            {
                rec.Constraints.Add(new SpeechRecognitionTopicConstraint(SpeechRecognitionScenario.Dictation, "dictation"));
            }
            var compiled = await rec.CompileConstraintsAsync();
            if (compiled.Status != SpeechRecognitionResultStatus.Success)
            {
                rec.Dispose();
                if (_mode == "dictation" && _words.Count > 0) { _mode = "passage"; await SpawnAsync(); return; }
                Error("unsupported", "Windows speech recognition is not available. Use Listener mode, or add an English speech pack in Windows Settings.");
                return;
            }
            rec.HypothesisGenerated += OnHypothesis;
            rec.ContinuousRecognitionSession.ResultGenerated += OnResult;
            rec.ContinuousRecognitionSession.Completed += OnCompleted;
            _rec = rec;
            await rec.ContinuousRecognitionSession.StartAsync();
            State("listening");
        }
        catch (Exception ex) when (ex.HResult == HResultPrivacyDeclined)
        {
            // online speech is off in Windows privacy settings: switch quietly to offline passage mode
            if (_mode == "dictation" && _words.Count > 0) { _mode = "passage"; await SpawnAsync(); }
            else Error("privacy", "Turn on Online speech recognition in Windows Settings → Privacy → Speech, or use Listener mode.");
        }
        catch (UnauthorizedAccessException)
        {
            _active = false;
            Error("not-allowed", "Microphone access is off. Allow Plajah to use the microphone in Windows Settings → Privacy → Microphone.");
        }
        catch (Exception ex)
        {
            if (ex.HResult == unchecked((int)0x80045509) || ex.Message.Contains("privacy", StringComparison.OrdinalIgnoreCase))
            {
                if (_mode == "dictation" && _words.Count > 0) { _mode = "passage"; await SpawnAsync(); return; }
            }
            Restart();
        }
    }

    private void OnHypothesis(SpeechRecognizer sender, SpeechRecognitionHypothesisGeneratedEventArgs args)
        => Send(new { type = "SPEECH_PARTIAL", text = args.Hypothesis.Text });

    private void OnResult(SpeechContinuousRecognitionSession sender, SpeechContinuousRecognitionResultGeneratedEventArgs args)
    {
        var r = args.Result;
        if (r.Status != SpeechRecognitionResultStatus.Success || r.Confidence == SpeechRecognitionConfidence.Rejected) return;
        var alts = new List<string>();
        try { alts = r.GetAlternates(3).Skip(1).Select(a => a.Text).ToList(); } catch { }
        Send(new { type = "SPEECH_FINAL", text = r.Text, alts });
    }

    private void OnCompleted(SpeechContinuousRecognitionSession sender, SpeechContinuousRecognitionCompletedEventArgs args)
    {
        if (args.Status == SpeechRecognitionResultStatus.UserCanceled) return;
        Restart();
    }

    private void Restart()
    {
        if (!_active || _suspended) return;
        var now = DateTime.UtcNow;
        if ((now - _windowStart).TotalSeconds > 6) { _windowStart = now; _restartsInWindow = 0; }
        _restartsInWindow++;
        var delay = _restartsInWindow > 6 ? 1500 : 100;          // back off a restart storm
        _ = Task.Delay(delay).ContinueWith(async _ => await SpawnAsync());
    }

    public void Dispose() { _active = false; _ = TearDownAsync(); }
}
