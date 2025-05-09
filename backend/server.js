// backend/server.js
const express = require('express');
const cors = require('cors');
// Remova imports que agora estão nas rotas (fetch, fs, path, archiver, os, uuidv4, convertGsmToMp3)
// const fetch = require('node-fetch'); // Não precisa mais aqui
// const fs = require('fs-extra'); // Não precisa mais aqui
// const path = require('path'); // Não precisa mais aqui
// const archiver = require('archiver'); // Não precisa mais aqui
// const os = require('os'); // Não precisa mais aqui

// Importa os routers das novas rotas (assumindo que você já fez a modularização)
// Se você ainda não modularizou, a configuração do cors vai direto na linha original do app.use(cors())
const downloadBatchRouter = require('./routes/downloadBatch');
const downloadSingleRouter = require('./routes/downloadSingle');


const app = express();
const port = 3000;

// Middlewares
// Configuração do middleware CORS para expor Content-Disposition
app.use(cors({
    exposedHeaders: ['Content-Disposition'] // EXPOR o cabeçalho Content-Disposition
}));
app.use(express.json());


// --- Usar os Routers para as Rotas Específicas ---

// Usa o router para a rota /download-batch
// O '/' dentro de downloadBatchRouter.js se torna '/download-batch/' aqui
app.use('/download-batch', downloadBatchRouter);

// Usa o router para a rota /download-single
// O '/' dentro de downloadSingleRouter.js se torna '/download-single/' aqui
app.use('/download-single', downloadSingleRouter);


// --- Rota Home ou Teste (Opcional) ---
app.get('/', (req, res) => {
    res.send('Backend do Widevoice Downloader está rodando!');
});


// --- Inicia o servidor ---
app.listen(port, () => {
    console.log(`Backend rodando em http://localhost:${port}`);
    // Mensagem atualizada para refletir as rotas ativas
    console.log('Rotas de download /download-batch e /download-single estão ativas.');
    // Mantém a mensagem sobre o FFmpeg
    console.log('Certifique-se de que o FFmpeg está instalado e acessível no ambiente do backend.');
});