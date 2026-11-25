// Funções do programa instalado que a tela de Configurações pode usar (cópias de segurança).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("operatto", {
  abrirPastaCopias: () => ipcRenderer.invoke("operatto:abrir-pasta-copias"),
  restaurarCopia: () => ipcRenderer.invoke("operatto:restaurar-copia"),
  demonstracao: (ligar) => ipcRenderer.invoke("operatto:demonstracao", ligar),
});
