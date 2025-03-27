!macro customInstall
  ; Don't create autostart entry here - we use app.setLoginItemSettings instead
  ; which works cross-platform (Windows, macOS, Linux)
!macroend

!macro customUnInstall
  ; No need to remove registry entry since we're not creating it
!macroend