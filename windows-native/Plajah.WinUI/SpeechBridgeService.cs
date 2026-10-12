using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Windows.Globalization;
using Windows.Media.SpeechRecognition;

namespace Plajah.WinUI;

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

    // Free-form listening (Ambo live captions / auto-scripture): the passage-list fallback is useless there,
    // so failures are reported to the web layer (which then switches to on-device Whisper) instead.
    private bool _strict;
    private int _consecutiveFailures;

    private static readonly object LogGate = new();
    private static void Log(string msg)
    {
        try
        {
            var dir = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Plajah", "logs");
            System.IO.Directory.CreateDirectory(dir);
            var file = System.IO.Path.Combine(dir, "speech.log");
            lock (LogGate)
            {
                var fi = new System.IO.FileInfo(file);
                if (fi.Exists && fi.Length > 500_000) System.IO.File.Move(file, file + ".old", overwrite: true);
                System.IO.File.AppendAllText(file, $"{DateTimeOffset.Now:O} {msg}{Environment.NewLine}");
            }
        }
        catch { /* logging must never throw */ }
    }

    private void Send(object o) => _post(JsonSerializer.Serialize(o));
    private void State(string s) { Log($"state {s} ({_mode})"); Send(new { type = "SPEECH_STATE", state = s, mode = _mode }); }
    private void Error(string code, string message) { Log($"ERROR {code}: {message}"); Send(new { type = "SPEECH_ERROR", code, message }); State("error"); }

    /// <summary>Checks (and if needed prompts for) microphone access for this packaged app.</summary>
    private async Task<bool> EnsureMicAsync()
    {
        try
        {
            var cap = Windows.Security.Authorization.AppCapabilityAccess.AppCapability.Create("microphone");
            var status = cap.CheckAccess();
            Log($"mic access: {status}");
            if (status == Windows.Security.Authorization.AppCapabilityAccess.AppCapabilityAccessStatus.UserPromptRequired)
            {
                status = await cap.RequestAccessAsync();
                Log($"mic access after prompt: {status}");
            }
            if (status == Windows.Security.Authorization.AppCapabilityAccess.AppCapabilityAccessStatus.DeniedByUser ||
                status == Windows.Security.Authorization.AppCapabilityAccess.AppCapabilityAccessStatus.DeniedBySystem)
            {
                Error("not-allowed", "Microphone access is off. Allow Plajah to use the microphone in Windows Settings → Privacy & security → Microphone.");
                return false;
            }
        }
        catch (Exception ex) { Log($"mic capability check failed: {ex.Message}"); }
        return true;
    }

    public async Task StartAsync(string? lang, IEnumerable<string>? words, bool strict = false)
    {
        _lang = string.IsNullOrWhiteSpace(lang) ? "en-US" : lang!;
        _words = (words ?? Enumerable.Empty<string>())
            .Select(w => new string(w.Where(c => char.IsLetterOrDigit(c) || c == '\'').ToArray()).ToLowerInvariant())
            .Where(w => w.Length > 0).Distinct().Take(800).ToList();
        _strict = strict; _consecutiveFailures = 0;
        _active = true; _suspended = false; _mode = "dictation";
        Log($"start lang={_lang} words={_words.Count} strict={strict}");
        if (!await EnsureMicAsync()) { _active = false; return; }
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
            // Ultra-low latency timeouts: finalize phrases within 350ms of silence
            rec.Timeouts.EndSilenceTimeout = TimeSpan.FromSeconds(0.35);
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
            Log($"compile ({_mode}): {compiled.Status}");
            if (compiled.Status != SpeechRecognitionResultStatus.Success)
            {
                rec.Dispose();
                if (!_strict && _mode == "dictation" && _words.Count > 0) { _mode = "passage"; await SpawnAsync(); return; }
                _active = false;
                Error("unsupported", $"Windows speech recognition is not available ({compiled.Status}). Add an English speech pack / turn on Online speech recognition in Windows Settings.");
                return;
            }
            rec.HypothesisGenerated += OnHypothesis;
            rec.ContinuousRecognitionSession.ResultGenerated += OnResult;
            rec.ContinuousRecognitionSession.Completed += OnCompleted;
            _rec = rec;
            _lastStart = DateTime.UtcNow;
            await rec.ContinuousRecognitionSession.StartAsync();
            State("listening");
        }
        catch (Exception ex) when (ex.HResult == HResultPrivacyDeclined)
        {
            Log($"privacy declined: {ex.Message}");
            // online speech is off in Windows privacy settings: switch quietly to offline passage mode (read-aloud only)
            if (!_strict && _mode == "dictation" && _words.Count > 0) { _mode = "passage"; await SpawnAsync(); }
            else { _active = false; Error("privacy", "Turn on Online speech recognition in Windows Settings → Privacy → Speech."); }
        }
        catch (UnauthorizedAccessException ex)
        {
            Log($"unauthorized: {ex.Message}");
            _active = false;
            Error("not-allowed", "Microphone access is off. Allow Plajah to use the microphone in Windows Settings → Privacy → Microphone.");
        }
        catch (Exception ex)
        {
            Log($"spawn failed 0x{ex.HResult:X8}: {ex.Message}");
            if (!_strict && (ex.HResult == HResultPrivacyDeclined || ex.Message.Contains("privacy", StringComparison.OrdinalIgnoreCase)))
            {
                if (_mode == "dictation" && _words.Count > 0) { _mode = "passage"; await SpawnAsync(); return; }
            }
            if (_strict && ++_consecutiveFailures >= 3)
            {
                _active = false;
                Error("failed", $"Windows speech recognition could not start (0x{ex.HResult:X8}): {ex.Message}");
                return;
            }
            Restart();
        }
    }

    private DateTime _lastStart = DateTime.UtcNow;

    private void OnHypothesis(SpeechRecognizer sender, SpeechRecognitionHypothesisGeneratedEventArgs args)
    {
        _consecutiveFailures = 0;
        Send(new { type = "SPEECH_PARTIAL", text = args.Hypothesis.Text });
    }

    private void OnResult(SpeechContinuousRecognitionSession sender, SpeechContinuousRecognitionResultGeneratedEventArgs args)
    {
        var r = args.Result;
        Log($"result status={r.Status} conf={r.Confidence} len={r.Text?.Length ?? 0}");
        if (r.Status != SpeechRecognitionResultStatus.Success || string.IsNullOrWhiteSpace(r.Text)) return;
        _consecutiveFailures = 0;
        var alts = new List<string>();
        try { alts = r.GetAlternates(3).Skip(1).Select(a => a.Text).ToList(); } catch { }
        Send(new { type = "SPEECH_FINAL", text = r.Text, alts });
    }

    private void OnCompleted(SpeechContinuousRecognitionSession sender, SpeechContinuousRecognitionCompletedEventArgs args)
    {
        Log($"completed: {args.Status}");
        if (args.Status == SpeechRecognitionResultStatus.UserCanceled) return;
        // A session that dies right after starting (mic busy, language unsupported, privacy) is a real failure.
        var quick = (DateTime.UtcNow - _lastStart).TotalSeconds < 3;
        var fatal = args.Status is SpeechRecognitionResultStatus.MicrophoneUnavailable
            or SpeechRecognitionResultStatus.TopicLanguageNotSupported
            or SpeechRecognitionResultStatus.GrammarLanguageMismatch
            or SpeechRecognitionResultStatus.GrammarCompilationFailure;
        if (_strict && (fatal || (quick && ++_consecutiveFailures >= 3)))
        {
            _active = false;
            Error("failed", $"Windows speech recognition stopped: {args.Status}");
            return;
        }
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
