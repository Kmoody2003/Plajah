using Microsoft.Windows.AppNotifications;
using Microsoft.Windows.AppNotifications.Builder;
using System;

namespace Plajah.Windows.Services;

/// <summary>
/// Windows toast notifications using Windows App SDK AppNotificationManager.
/// Supports:
///   • Standard info/message toasts
///   /// Attribution image (Plajah logo in the top-left)
///   • Deep-link argument passed back to App when the toast is tapped
///   • Progress notifications (for uploads, audiobook generation, etc.)
///   • Inline reply text input (for chat notifications)
/// </summary>
public class ToastService
{
    // ── Simple toast ──────────────────────────────────────────────────────────
    public void Show(string title, string body, string? deepLink = null)
    {
        try
        {
            var builder = new AppNotificationBuilder()
                .AddArgument("deepLink", deepLink ?? "")
                .SetAppLogoOverride(new Uri("ms-appx:///Assets/StoreLogo.scale-100.png"),
                                   AppNotificationImageCrop.Circle)
                .AddText(title, new AppNotificationTextProperties().SetMaxLines(1))
                .AddText(body,  new AppNotificationTextProperties().SetMaxLines(3));

            AppNotificationManager.Default.Show(builder.BuildNotification());
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[Toast] Show failed: {ex.Message}");
        }
    }

    // ── Chat / message toast with inline reply ────────────────────────────────
    public void ShowMessage(
        string senderName,
        string message,
        string? avatarUrl,
        string roomId)
    {
        try
        {
            var builder = new AppNotificationBuilder()
                .AddArgument("deepLink", $"chat/{roomId}")
                .AddText(senderName)
                .AddText(message, new AppNotificationTextProperties().SetMaxLines(2))
                .AddTextBox("replyBox", "Reply…", "Send")
                .AddButton(new AppNotificationButton("Reply")
                    .AddArgument("action", "reply")
                    .AddArgument("room",   roomId)
                    .SetInputId("replyBox"));

            AppNotificationManager.Default.Show(builder.BuildNotification());
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[Toast] ShowMessage failed: {ex.Message}");
        }
    }

    // ── Progress notification (e.g. audiobook generation) ────────────────────
    public AppNotification? ShowProgress(
        string title,
        string statusText,
        double value,     // 0.0 – 1.0
        string tag,
        string group = "progress")
    {
        try
        {
            var progressData = new AppNotificationProgressData(1u)
            {
                Title       = title,
                Value       = value,
                ValueStringOverride = $"{Math.Round(value * 100)}%",
                Status      = statusText,
            };

            var builder = new AppNotificationBuilder()
                .AddText(title)
                .AddProgressBar(new AppNotificationProgressBar()
                    .BindTitle()
                    .BindValue()
                    .BindValueStringOverride()
                    .BindStatus());

            var notification = builder.BuildNotification();
            notification.Tag   = tag;
            notification.Group = group;

            AppNotificationManager.Default.Show(notification);
            return notification;
        }
        catch
        {
            return null;
        }
    }

    public async System.Threading.Tasks.Task UpdateProgressAsync(
        string tag, string group, double value, string statusText)
    {
        try
        {
            var progressData = new AppNotificationProgressData(2u)
            {
                Value  = value,
                Status = statusText,
                ValueStringOverride = $"{Math.Round(value * 100)}%",
            };
            await AppNotificationManager.Default
                .UpdateAsync(progressData, tag, group)
                .AsTask()
                .ConfigureAwait(false);
        }
        catch { }
    }
}
