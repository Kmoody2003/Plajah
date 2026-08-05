' Plajah Roku Channel — Entry Point
' Uses Roku Web Engine to load the hosted Plajah web app.
' The web app detects Roku via navigator.userAgent and activates
' theme-big-screen + D-pad navigation automatically.

Sub Main(args As Dynamic)
    screen = CreateObject("roSGScreen")
    m.port = CreateObject("roMessagePort")
    screen.setMessagePort(m.port)

    scene = screen.CreateScene("MainScene")
    screen.Show()

    ' Pass any deep-link args (voice search, content ID) into the scene
    if args.DoesExist("contentId") then
        scene.callFunc("navigateTo", args.contentId)
    end if

    while (true)
        msg = wait(0, m.port)
        msgType = type(msg)

        if msgType = "roSGScreenEvent" then
            if msg.isScreenClosed() then
                return
            end if
        end if
    end while
End Sub
