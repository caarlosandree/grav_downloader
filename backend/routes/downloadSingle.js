// backend/routes/downloadSingle.js
const express = require('express');
const router = express.Router(); // Usamos Router para definir sub-rotas
const fetch = require('node-fetch'); // Para Node.js < 18
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const { convertGsmToMp3 } = require('../converter'); // Importa a função de conversão do nível acima

// A lógica principal do download individual
const handleDownloadSingle = async (req, res) => {
    console.log('Requisição de download individual recebida.');
    const { recordingUrl } = req.body;

    if (!recordingUrl) {
        console.error('URL da gravação não fornecida na requisição individual.');
        return res.status(400).json({ error: 'URL da gravação é obrigatória.' });
    }

    // Cria um diretório temporário para este download individual
    const tempDir = path.join(os.tmpdir(), `gravacao_temp_${uuidv4()}`);
    const originalFilePath = path.join(tempDir, 'original.gsm'); // Nome fixo temporário para o arquivo original
    // Tenta extrair um nome base do final da URL, removendo '.gsm' e parâmetros de query
    const urlBaseNameMatch = recordingUrl.match(/\/([^/?#]+)\.gsm(\?.*)?(#.*)?$/i); // Ajustado regex para ser mais robusto
    const outputFileNameBase = urlBaseNameMatch ? urlBaseNameMatch[1] : 'gravacao'; // Ex: 'UO00211142404444-S-0538-1746791193.639567'

    // Caminho temporário para o arquivo MP3 de saída (dentro do tempDir)
    const outputMp3Path = path.join(tempDir, `${outputFileNameBase}.mp3`);

    try {
        // 1. Garantir que o diretório temporário exista
        await fs.ensureDir(tempDir);
        console.log(`Diretório temporário criado: ${tempDir}`);

        // 2. Baixar o arquivo original da URL
        console.log(`Baixando arquivo original de: ${recordingUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 segundos de timeout

        const response = await fetch(recordingUrl, { signal: controller.signal });
        clearTimeout(timeoutId); // Limpa o timeout se o fetch terminar antes

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'N/A');
            console.error(`Erro ao baixar arquivo original (Status: ${response.status}). Corpo da resposta: ${errorBody}`);
            throw new Error(`Falha ao baixar a gravação: Status ${response.status}.`);
        }

        // Verifica se a resposta não está vazia
        if (response.status === 204 || response.headers.get('Content-Length') === '0') {
            const errorMsg = 'Resposta vazia (arquivo não encontrado ou vazio na origem)';
            console.error(`Erro ao baixar ${recordingUrl}: ${errorMsg}`);
            throw new Error(errorMsg);
        }


        const fileStream = fs.createWriteStream(originalFilePath);
        await new Promise((resolve, reject) => {
            response.body.pipe(fileStream);
            response.body.on('error', (err) => {
                console.error(`Erro no stream de download para ${recordingUrl}:`, err);
                reject(err);
            });
            fileStream.on('finish', resolve);
        });
        console.log(`Arquivo original baixado para: ${originalFilePath}`);

        // 3. Converter o arquivo para MP3
        console.log(`Convertendo ${path.basename(originalFilePath)} para MP3...`);
        // convertGsmToMp3 já lida com verificação de existência do input e criação do diretório de saída
        const finalMp3Path = await convertGsmToMp3(originalFilePath, outputMp3Path);
        console.log(`Conversão concluída. Arquivo MP3 em: ${finalMp3Path}`);

        // 4. Enviar o arquivo MP3 de volta para o frontend
        // Define cabeçalhos para forçar o download no navegador
        res.setHeader('Content-Type', 'audio/mpeg'); // MIME type para MP3
        // Sugere um nome de arquivo para o download - AGORA SEM "_convertido"
        const suggestedFilename = `${outputFileNameBase}.mp3`; // <-- CORRIGIDO AQUI
        res.setHeader('Content-Disposition', `attachment; filename="${suggestedFilename}"`);

        // Cria um stream de leitura do arquivo MP3 e o envia na resposta
        const mp3Stream = fs.createReadStream(finalMp3Path);
        mp3Stream.pipe(res); // Envia o stream do arquivo MP3 para a resposta HTTP

        // Limpa o diretório temporário após o stream terminar ou houver erro
        mp3Stream.on('end', async () => {
            console.log('Stream do arquivo MP3 encerrado. Limpando diretório temporário...');
            try {
                // Verifica se o diretório temporário existe antes de tentar remover
                const tempDirExists = await fs.pathExists(tempDir);
                if (tempDirExists) {
                    await fs.remove(tempDir);
                    console.log(`Diretório temporário ${tempDir} limpo.`);
                }
            } catch (cleanError) {
                console.error(`Erro ao limpar diretório temporário ${tempDir} após stream encerrado:`, cleanError);
            }
        });

        mp3Stream.on('error', async (streamError) => {
            console.error('Erro no stream do arquivo MP3:', streamError);
            // Se houver erro no stream, tenta enviar um status 500 se os cabeçalhos ainda não foram enviados
            if (!res.headersSent) {
                res.status(500).json({ error: 'Erro ao transmitir o arquivo MP3.', details: streamError.message });
            } else {
                // Se os cabeçalhos já foram enviados, apenas encerra a resposta com erro
                res.end(); // Pode resultar em download incompleto ou corrompido no cliente
            }
            // Garante a limpeza do diretório mesmo com erro no stream
            try {
                const tempDirExists = await fs.pathExists(tempDir);
                if (tempDirExists) {
                    await fs.remove(tempDir);
                    console.log(`Diretório temporário ${tempDir} limpo após erro no stream.`);
                }
            } catch (cleanError) {
                console.error(`Erro ao limpar diretório temporário ${tempDir} após erro no stream:`, cleanError);
            }
        });


    } catch (error) {
        console.error('Erro no processamento do download individual:', error);
        // Limpa o diretório temporário em caso de erro no processamento (download, conversão, etc.)
        try {
            // Verifica se o diretório temporário foi criado antes de tentar remover
            const tempDirExists = await fs.pathExists(tempDir);
            if (tempDirExists) {
                await fs.remove(tempDir);
                console.log(`Diretório temporário ${tempDir} limpo após erro.`);
            }
        } catch (cleanError) {
            console.error(`Erro ao limpar diretório temporário ${tempDir} após erro no processamento:`, cleanError);
        }

        // Envia resposta de erro para o frontend
        if (!res.headersSent) { // Verifica se os cabeçalhos já foram enviados
            res.status(500).json({
                error: 'Erro interno do servidor ao processar a gravação individual.',
                details: error.message
            });
            console.log('Resposta 500 enviada ao frontend.');
        } else {
            console.error('Erro capturado após cabeçalhos enviados. Não é possível enviar status 500.', error);
            // Já que não pode enviar resposta de erro, apenas loga
        }
    }
};

// Define a rota POST / que usa o handler
router.post('/', handleDownloadSingle);

module.exports = router; // Exporta o router