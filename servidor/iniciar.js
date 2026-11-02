// Inicia só o servidor (desenvolvimento): npm run servidor
// Dados ficam em ./dados-dev; use FLORICULTURA_PORTA para outra porta.
const path = require("node:path");
const { iniciarServidor } = require("./app");

const porta = Number(process.env.FLORICULTURA_PORTA) || 8686;
const app = iniciarServidor({ pastaDados: process.env.FLORICULTURA_DADOS || path.join(__dirname, "..", "dados-dev"), porta });
app.pronto.then((p) => console.log(`Gestão de Floriculturas em http://localhost:${p}`));
process.on("SIGINT", () => app.parar().then(() => process.exit(0)));
