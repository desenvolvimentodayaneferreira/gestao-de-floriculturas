// Funções do programa instalado que a tela de Configurações pode usar (cópias de segurança).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("floricultura", {
  abrirPastaCopias: () => ipcRenderer.invoke("floricultura:abrir-pasta-copias"),
  restaurarCopia: () => ipcRenderer.invoke("floricultura:restaurar-copia"),
  demonstracao: (ligar) => ipcRenderer.invoke("floricultura:demonstracao", ligar),
});
