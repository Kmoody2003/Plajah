using System;
using System.Threading.Tasks;
using Windows.Foundation;
using Windows.Security.Credentials.UI;

namespace Plajah.WinUI;

public static class WindowsHelloService
{
    public static async Task<WindowsHelloStatus> CheckAsync()
    {
        var availability = await AwaitWinRt(UserConsentVerifier.CheckAvailabilityAsync());
        return availability switch
        {
            UserConsentVerifierAvailability.Available => new WindowsHelloStatus(true, true, "available"),
            UserConsentVerifierAvailability.DeviceNotPresent => new WindowsHelloStatus(false, false, "device-not-present"),
            UserConsentVerifierAvailability.NotConfiguredForUser => new WindowsHelloStatus(false, false, "not-configured"),
            UserConsentVerifierAvailability.DisabledByPolicy => new WindowsHelloStatus(false, false, "disabled-by-policy"),
            UserConsentVerifierAvailability.DeviceBusy => new WindowsHelloStatus(false, false, "device-busy"),
            _ => new WindowsHelloStatus(false, false, "unavailable"),
        };
    }

    public static async Task<WindowsHelloResult> VerifyAsync(string message)
    {
        var status = await CheckAsync();
        if (!status.Available)
            return new WindowsHelloResult(false, status.Reason);

        var result = await AwaitWinRt(UserConsentVerifier.RequestVerificationAsync(
            string.IsNullOrWhiteSpace(message) ? "Verify your identity to continue in Plajah" : message));

        return result == UserConsentVerificationResult.Verified
            ? new WindowsHelloResult(true, "verified")
            : new WindowsHelloResult(false, result switch
            {
                UserConsentVerificationResult.Canceled => "canceled",
                UserConsentVerificationResult.DeviceBusy => "device-busy",
                UserConsentVerificationResult.RetriesExhausted => "retries-exhausted",
                UserConsentVerificationResult.DisabledByPolicy => "disabled-by-policy",
                _ => "not-verified",
            });
    }

    private static Task<T> AwaitWinRt<T>(IAsyncOperation<T> operation)
    {
        var completion = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        operation.Completed = (completed, status) =>
        {
            if (status == AsyncStatus.Completed)
                completion.TrySetResult(completed.GetResults());
            else if (status == AsyncStatus.Canceled)
                completion.TrySetCanceled();
            else
                completion.TrySetException(completed.ErrorCode ?? new Exception("Windows operation failed."));
        };
        return completion.Task;
    }
}

public sealed record WindowsHelloStatus(bool Supported, bool Available, string Reason);
public sealed record WindowsHelloResult(bool Verified, string Reason);
