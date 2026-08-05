using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Windows.UI.StartScreen;

namespace Plajah.Windows.Services;

/// <summary>
/// Windows taskbar / Start menu Jump List.
///
/// Jump list entries appear when the user right-clicks the Plajah taskbar icon
/// or right-clicks the Start menu tile.  They provide quick deep-link access
/// to common actions without opening the full app.
///
/// Categories:
///   Tasks       — always-visible static actions
///   Recent      — last 5 items the user interacted with (personalized)
///   Quick Nav   — one-tap navigation to main sections
/// </summary>
public class JumpListService
{
    // ── Quick navigation deep links ───────────────────────────────────────────
    private static readonly List<(string Title, string Args, string Description, string Icon)>
    QuickNavItems = new()
    {
        ("Chora — Music",    "view=MUSIC",     "Browse your music library",    "ms-appx:///Assets/Icons/music.png"),
        ("Taleo — Film & TV","view=MOVIES_TV", "Browse movies and TV shows",   "ms-appx:///Assets/Icons/film.png"),
        ("Lorea — Books",    "view=BOOKS",     "Browse your book library",     "ms-appx:///Assets/Icons/book.png"),
        ("Social Feed",      "view=FEED",      "Open the social feed",         "ms-appx:///Assets/Icons/feed.png"),
        ("Muse — AI Agent",  "view=MUSE",      "Open your private AI agent",   "ms-appx:///Assets/Icons/muse.png"),
    };

    public async Task UpdateJumpListAsync(bool isSignedIn = true)
    {
        if (!JumpList.IsSupported()) return;

        try
        {
            var jumpList = await JumpList.LoadCurrentAsync();
            jumpList.SystemGroupKind = JumpListSystemGroupKind.None;
            jumpList.Items.Clear();

            // ── Quick Navigation group ──────────────────────────────────────
            foreach (var (title, args, desc, icon) in QuickNavItems)
            {
                var item = JumpListItem.CreateWithArguments(args, title);
                item.Description = desc;
                item.GroupName   = "Quick Navigation";
                try
                {
                    item.Logo = new Uri(icon);
                }
                catch
                {
                    // Logo URI may fail if icon assets aren't present yet — non-fatal
                }
                jumpList.Items.Add(item);
            }

            // ── Tasks (always visible, above groups) ──────────────────────
            var uploadTask = JumpListItem.CreateWithArguments("action=upload", "Upload Content");
            uploadTask.Description = "Upload music, video, or a book";
            uploadTask.GroupName   = string.Empty; // Tasks group
            jumpList.Items.Add(uploadTask);

            if (!isSignedIn)
            {
                var signInTask = JumpListItem.CreateWithArguments("action=signin", "Sign In");
                signInTask.Description = "Sign in to your Plajah account";
                signInTask.GroupName   = string.Empty;
                jumpList.Items.Add(signInTask);
            }

            await jumpList.SaveAsync();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[JumpList] Update failed: {ex.Message}");
        }
    }

    public async Task ClearJumpListAsync()
    {
        if (!JumpList.IsSupported()) return;
        try
        {
            var jumpList = await JumpList.LoadCurrentAsync();
            jumpList.Items.Clear();
            await jumpList.SaveAsync();
        }
        catch { }
    }
}
