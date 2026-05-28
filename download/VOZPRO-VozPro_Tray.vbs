' VozPro - Iniciador Silencioso
' Inicia o System Tray sem mostrar nenhuma janela
' Use este arquivo para auto-inicio com Windows

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "pythonw.exe vozpro_tray.py", 0, False
