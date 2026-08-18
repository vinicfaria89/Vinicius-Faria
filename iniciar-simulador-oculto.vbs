' Inicia o GCB Simulador em segundo plano, sem abrir nenhuma janela de terminal.
' Usado pelo atalho da Área de Trabalho e pela inicialização automática do Windows.
Set WshShell = CreateObject("WScript.Shell")
scriptDir = Left(WScript.ScriptFullName, Len(WScript.ScriptFullName) - Len(WScript.ScriptName))
batPath = scriptDir & "iniciar-simulador.bat"
WshShell.Run Chr(34) & batPath & Chr(34), 0, False
