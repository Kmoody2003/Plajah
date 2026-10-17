param(
  [string]$Mode = "mic",
  [string]$WavPath = ""
)

$code = @"
using System;
using System.IO;
using System.Globalization;
using System.Speech.Recognition;
using System.Threading;

public class PlajahSpeechRunner {
    private static string Esc(string s) {
        if (s == null) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ");
    }

    private static void Emit(string json) {
        Console.Out.WriteLine(json);
        Console.Out.Flush();
    }

    private static void LoadGrammars(SpeechRecognitionEngine rec) {
        DictationGrammar dict = new DictationGrammar();
        dict.Weight = 0.85f;
        rec.LoadGrammar(dict);

        // High-priority Bible reference grammar so book + chapter + verse are recognized with high accuracy
        string[] books = new string[] {
            "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
            "First Samuel", "Second Samuel", "1 Samuel", "2 Samuel",
            "First Kings", "Second Kings", "1 Kings", "2 Kings",
            "First Chronicles", "Second Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
            "Psalms", "Psalm", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
            "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah",
            "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
            "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
            "First Corinthians", "Second Corinthians", "1 Corinthians", "2 Corinthians",
            "Galatians", "Ephesians", "Philippians", "Colossians",
            "First Thessalonians", "Second Thessalonians",
            "First Timothy", "Second Timothy", "Titus", "Philemon", "Hebrews", "James",
            "First Peter", "Second Peter", "First John", "Second John", "Third John", "Jude", "Revelation"
        };
        Choices bookChoices = new Choices(books);
        Choices numChoices = new Choices();
        for (int i = 1; i <= 150; i++) numChoices.Add(i.ToString());

        Choices prefixChoices = new Choices(new string[] {
            "turn with me to", "open your bibles to", "let us read", "look at", "in the book of", "reading from"
        });

        // Pattern 1: [prefix] Book [chapter] X [verse] Y
        GrammarBuilder gb1 = new GrammarBuilder();
        gb1.Append(prefixChoices, 0, 1);
        gb1.Append(bookChoices);
        gb1.Append("chapter", 0, 1);
        gb1.Append(numChoices);
        gb1.Append("verse", 0, 1);
        gb1.Append(numChoices);
        Grammar g1 = new Grammar(gb1);
        g1.Weight = 1.0f;
        rec.LoadGrammar(g1);

        // Pattern 2: [prefix] Book chapter X (bare chapter)
        GrammarBuilder gb2 = new GrammarBuilder();
        gb2.Append(prefixChoices, 0, 1);
        gb2.Append(bookChoices);
        gb2.Append("chapter", 0, 1);
        gb2.Append(numChoices);
        Grammar g2 = new Grammar(gb2);
        g2.Weight = 0.95f;
        rec.LoadGrammar(g2);

        // Pattern 3: contextual "verse X" / "chapter X verse Y"
        GrammarBuilder gb3 = new GrammarBuilder();
        gb3.Append("verse");
        gb3.Append(numChoices);
        Grammar g3 = new Grammar(gb3);
        g3.Weight = 0.92f;
        rec.LoadGrammar(g3);
    }

    public static void RunWav(string wavPath) {
        using (SpeechRecognitionEngine rec = new SpeechRecognitionEngine(new CultureInfo("en-US"))) {
            LoadGrammars(rec);
            rec.EndSilenceTimeout = TimeSpan.FromSeconds(0.28);
            rec.EndSilenceTimeoutAmbiguous = TimeSpan.FromSeconds(0.4);
            rec.SetInputToWaveFile(wavPath);
            string lastPartial = "";
            ManualResetEvent done = new ManualResetEvent(false);

            rec.SpeechHypothesized += (s, e) => {
                if (e.Result != null && !string.IsNullOrWhiteSpace(e.Result.Text)) {
                    lastPartial = e.Result.Text;
                    Emit("{\"type\":\"partial\",\"text\":\"" + Esc(e.Result.Text) + "\"}");
                }
            };
            rec.SpeechRecognized += (s, e) => {
                if (e.Result != null && !string.IsNullOrWhiteSpace(e.Result.Text)) {
                    lastPartial = "";
                    Emit("{\"type\":\"final\",\"text\":\"" + Esc(e.Result.Text) + "\"}");
                }
            };
            rec.SpeechRecognitionRejected += (s, e) => {
                string fallback = (e.Result != null && !string.IsNullOrWhiteSpace(e.Result.Text)) ? e.Result.Text : lastPartial;
                lastPartial = "";
                if (!string.IsNullOrWhiteSpace(fallback)) {
                    Emit("{\"type\":\"final\",\"text\":\"" + Esc(fallback) + "\"}");
                }
            };
            rec.RecognizeCompleted += (s, e) => {
                if (!string.IsNullOrWhiteSpace(lastPartial)) {
                    Emit("{\"type\":\"final\",\"text\":\"" + Esc(lastPartial) + "\"}");
                    lastPartial = "";
                }
                done.Set();
            };

            rec.RecognizeAsync(RecognizeMode.Multiple);
            done.WaitOne(15000);
            Emit("{\"type\":\"done\"}");
        }
    }

    public static void RunMic() {
        using (SpeechRecognitionEngine rec = new SpeechRecognitionEngine(new CultureInfo("en-US"))) {
            LoadGrammars(rec);
            rec.InitialSilenceTimeout = TimeSpan.FromSeconds(0);
            rec.BabbleTimeout = TimeSpan.FromSeconds(0);
            rec.EndSilenceTimeout = TimeSpan.FromSeconds(0.32);
            rec.EndSilenceTimeoutAmbiguous = TimeSpan.FromSeconds(0.45);

            try {
                rec.SetInputToDefaultAudioDevice();
            } catch (Exception ex) {
                Emit("{\"type\":\"error\",\"message\":\"" + Esc(ex.Message) + "\"}");
                return;
            }

            string lastPartial = "";
            int lastLevelTick = 0;
            rec.AudioLevelUpdated += (s, e) => {
                int now = Environment.TickCount;
                if (now - lastLevelTick >= 60) {
                    lastLevelTick = now;
                    double lvl = Math.Min(1.0, e.AudioLevel / 65.0);
                    Emit("{\"type\":\"level\",\"level\":" + lvl.ToString("0.00", CultureInfo.InvariantCulture) + "}");
                }
            };

            rec.SpeechHypothesized += (s, e) => {
                if (e.Result != null && !string.IsNullOrWhiteSpace(e.Result.Text)) {
                    lastPartial = e.Result.Text;
                    Emit("{\"type\":\"partial\",\"text\":\"" + Esc(e.Result.Text) + "\"}");
                }
            };

            rec.SpeechRecognized += (s, e) => {
                if (e.Result != null && !string.IsNullOrWhiteSpace(e.Result.Text)) {
                    lastPartial = "";
                    Emit("{\"type\":\"final\",\"text\":\"" + Esc(e.Result.Text) + "\"}");
                }
            };

            rec.SpeechRecognitionRejected += (s, e) => {
                string fallback = (e.Result != null && !string.IsNullOrWhiteSpace(e.Result.Text)) ? e.Result.Text : lastPartial;
                lastPartial = "";
                if (!string.IsNullOrWhiteSpace(fallback)) {
                    Emit("{\"type\":\"final\",\"text\":\"" + Esc(fallback) + "\"}");
                }
            };

            ManualResetEvent done = new ManualResetEvent(false);
            rec.RecognizeCompleted += (s, e) => {
                try {
                    rec.RecognizeAsync(RecognizeMode.Multiple);
                } catch {
                    done.Set();
                }
            };

            Emit("{\"type\":\"status\",\"status\":\"Listening (Windows Native Speech)\"}");
            rec.RecognizeAsync(RecognizeMode.Multiple);

            // Keep alive until stdin closes or parent terminates
            string line;
            while ((line = Console.In.ReadLine()) != null) {
                if (line.Trim() == "STOP") break;
            }
            try { rec.RecognizeAsyncCancel(); } catch {}
        }
    }
}
"@

$cacheDir = Join-Path $PSScriptRoot "..\.tmp-asr-test"
if (-not (Test-Path $cacheDir)) {
    New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
}
$dllPath = Join-Path $cacheDir "PlajahSpeechRunner_v2.dll"

if (Test-Path $dllPath) {
    Add-Type -ReferencedAssemblies System.Speech -Path $dllPath
} else {
    Add-Type -ReferencedAssemblies System.Speech -TypeDefinition $code -OutputAssembly $dllPath
    Add-Type -ReferencedAssemblies System.Speech -Path $dllPath
}

if ($Mode -eq "wav" -and $WavPath) {
    [PlajahSpeechRunner]::RunWav($WavPath)
} else {
    [PlajahSpeechRunner]::RunMic()
}
