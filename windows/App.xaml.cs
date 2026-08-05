using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;
using Microsoft.Windows.AppNotifications;
using System;

namespace Plajah.Windows;

public partial class App : Application
{
    private MainWindow? _window;

    public App()
    {
        InitializeComponent();
        // Prevent multiple instances — bring existing window to foreground
        EnsureSingleInstance();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();
        _window.Activate();

        // Register app notification activator (toast callbacks)
        AppNotificationManager.Default.Register();
        AppNotificationManager.Default.NotificationInvoked += OnNotificationInvoked;
    }

    private void EnsureSingleInstance()
    {
        var instance = AppInstance.FindOrRegisterForKey("PlajahApp-SingleInstance");
        if (!instance.IsCurrent)
        {
            // Another instance is running — redirect and exit
            var activationArgs = AppInstance.GetCurrent().GetActivatedEventArgs();
            instance.RedirectActivationToAsync(activationArgs).AsTask().Wait();
            System.Diagnostics.Process.GetCurrentProcess().Kill();
        }
        else
        {
            instance.Activated += OnActivated;
        }
    }

    private void OnActivated(object? sender, AppActivationArguments args)
    {
        _window?.DispatcherQueue.TryEnqueue(() => _window.BringToFront());
    }

    private void OnNotificationInvoked(AppNotificationManager sender, AppNotificationActivatedEventArgs args)
    {
        // Handle toast notification tap — deep-link into the web app
        var arguments = args.Argument;
        _window?.DispatcherQueue.TryEnqueue(() =>
        {
            _window.BringToFront();
            if (!string.IsNullOrEmpty(arguments))
                _window.NavigateToDeepLink(arguments);
        });
    }
}
