' Starts the dashboard without a console window.
' Put a shortcut to this file in shell:startup (Win+R -> shell:startup).
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.Run "cmd /c npm start", 0, False
