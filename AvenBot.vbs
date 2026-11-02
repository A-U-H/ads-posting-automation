Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

' Check if port 3001 is listening
Set oExec = WshShell.Exec("cmd /c netstat -ano | findstr :3001 | findstr LISTENING")
output = oExec.StdOut.ReadAll()

If InStr(output, "LISTENING") = 0 Then
    WshShell.Run "cmd /c node server/index.js", 0, False
    WScript.Sleep 2500
End If

' Open default browser to dashboard
WshShell.Run "http://localhost:3001"
