// backend/routes/downloadBatch.js
const express = require('express');
const router = express.Router(); // Usamos Router para definir sub-rotas
const fetch = require('node-fetch'); // Para Node.js < 18
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const { convertGsmToMp3 } = require('../converter'); // Importa a função de conversão do nível acima

// A lógica principal do download em lote
const handleDownloadBatch = async (req, res) => {
    console.log('Requisição de download em lote recebida.');
    // Esperamos um array de objetos, onde cada objeto DEVE ter uma propriedade 'url_gravacao'
    // e opcionalmente outras propriedades como 'origem', 'destino', 'datahora', 'nomeoperador', 'ramal'
    const { recordings, convertToMp3 } = req.body;

    console.log(`Converter para MP3 solicitado: ${!!convertToMp3}`);

    // Validação básica: recordings deve ser um array não vazio
    if (!recordings || !Array.isArray(recordings) || recordings.length === 0) {
        console.log('Nenhuma gravação válida fornecida na requisição.');
        return res.status(400).json({ error: 'Nenhuma lista de gravações válida fornecida no corpo da requisição.' });
    }

    // Validação mais específica: cada item no array deve ter uma url_gravacao válida
    const invalidRecordings = recordings.filter(item =>
        !item || !item.url_gravacao || typeof item.url_gravacao !== 'string' || item.url_gravacao.trim() === ''
    );

    if (invalidRecordings.length > 0) {
        console.error(`Alguns itens na lista de gravações não possuem url_gravacao válida. Total inválido: ${invalidRecordings.length}`);
        // Decidir como lidar: rejeitar tudo ou processar apenas os válidos?
        // Vamos rejeitar a requisição inteira para garantir que o frontend envie dados corretos.
        return res.status(400).json({ error: `Alguns itens na lista de gravações (${invalidRecordings.length}) não possuem 'url_gravacao' válida.` });
    }


    console.log(`Recebidas ${recordings.length} gravações para processar.`);

    // Cria um diretório temporário para este lote
    const tempDir = path.join(os.tmpdir(), `widevoice_batch_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    console.log(`Criando diretório temporário: ${tempDir}`);

    try {
        await fs.ensureDir(tempDir); // Garante que o diretório temporário exista

        const output = fs.createWriteStream(path.join(tempDir, 'gravacoes.zip')); // Stream de saída para o ZIP
        const archive = archiver('zip', {
            zlib: { level: 9 } // Nível de compressão
        });

        let failedDownloads = [];
        let failedConversions = [];
        let processedCount = 0;
        let totalToProcess = recordings.length;

        // O arquivo de log de processamento
        const logFileName = 'processamento_relatorio.log';
        const logFilePath = path.join(tempDir, logFileName);
        const logStream = fs.createWriteStream(logFilePath);

        // Cabeçalho do log
        logStream.write(`Relatório de Processamento de Download em Lote\n`);
        logStream.write(`Data/Hora Início: ${new Date().toISOString()}\n`);
        logStream.write(`Total de gravações recebidas: ${totalToProcess}\n`);
        logStream.write(`Conversão para MP3 solicitada: ${convertToMp3 ? 'Sim' : 'Não'}\n`);
        logStream.write(`---------------------------------------------\n\n`);


        // Pipe archive output to the file stream
        archive.pipe(output);

        // Promise que monitora o fechamento do stream de output do ZIP
        const zipFinished = new Promise((resolve, reject) => {
            output.on('close', () => {
                console.log('Arquivo ZIP finalizado e fechado.');
                resolve();
            });
            output.on('end', () => {
                console.log('Dados do stream de output ZIP esgotados.');
            });
            archive.on('warning', function(err) {
                if (err.code === 'ENOENT') {
                    console.warn('Archiver warning:', err);
                } else {
                    // Lança outros erros como erro fatal
                    reject(err);
                }
            });
            archive.on('error', function(err) {
                console.error('Archiver error:', err);
                reject(err);
            });
        });


        // --- Processamento de Cada Gravação ---
        // Usamos Promise.all para processar os downloads/conversões em paralelo,
        // mas com um limite de concorrência para não sobrecarregar o sistema.
        const CONCURRENCY_LIMIT = 10; // Limita 10 downloads/conversões paralelos
        const processingPromises = recordings.map(async (item, index) => {
            // *** ALTERAÇÃO AQUI: Usar item.url_gravacao ***
            const url = item.url_gravacao;
            const originalFileName = url.split('/').pop().split('?')[0]; // Nome base da URL sem query params
            // Gera um nome de arquivo mais amigável para o ZIP, talvez usando outros dados
            // Ex: DataHora_Origem_Destino.gsm ou .mp3
            // Garantir nomes de arquivo seguros para o ZIP
            const baseName = `${item.datahora?.replace(/[- :]/g, '_') || 'desconhecido'}_${item.origem || 'origem'}_${item.destino || 'destino'}`;
            const safeBaseName = baseName.replace(/[^a-zA-Z0-9_\-.]/g, ''); // Remove caracteres inválidos

            let downloadFilePath = path.join(tempDir, `${uuidv4()}_${safeBaseName}.gsm`); // Nome temporário para o GSM
            let finalFileNameInZip = `${safeBaseName}.gsm`; // Nome inicial no ZIP

            let conversionNeeded = convertToMp3; // Precisa converter?

            console.log(`[${index + 1}/${totalToProcess}] Processando ${originalFileName}...`);
            logStream.write(`[${index + 1}/${totalToProcess}] URL Original: ${url}\n`);
            logStream.write(`Dados da API: DataHora=${item.datahora || 'N/A'}, Origem=${item.origem || 'N/A'}, Destino=${item.destino || 'N/A'}, Operador=${item.nomeoperador || 'N/A'}, Ramal=${item.ramal || 'N/A'}\n`);


            try {
                // 1. Baixar o arquivo
                console.log(`[${index + 1}/${totalToProcess}] Baixando ${url}...`);
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Status HTTP ${response.status}`);
                }
                const fileStream = fs.createWriteStream(downloadFilePath);
                await new Promise((resolve, reject) => {
                    response.body.pipe(fileStream);
                    fileStream.on('finish', resolve);
                    fileStream.on('error', reject);
                });
                console.log(`[${index + 1}/${totalToProcess}] Download concluído: ${downloadFilePath}`);
                logStream.write(`Download: Sucesso\n`);

                // 2. Converter para MP3 (se necessário)
                if (conversionNeeded) {
                    const mp3FilePath = path.join(tempDir, `${uuidv4()}_${safeBaseName}.mp3`); // Nome temporário para o MP3
                    console.log(`[${index + 1}/${totalToProcess}] Convertendo para MP3: ${downloadFilePath} -> ${mp3FilePath}...`);
                    try {
                        // *** ALTERAÇÃO AQUI: Chamar convertGsmToMp3 com os caminhos corretos ***
                        await convertGsmToMp3(downloadFilePath, mp3FilePath);
                        console.log(`[${index + 1}/${totalToProcess}] Conversão concluída: ${mp3FilePath}`);
                        logStream.write(`Conversão: Sucesso\n`);
                        downloadFilePath = mp3FilePath; // Usar o arquivo MP3 para adicionar ao ZIP
                        finalFileNameInZip = `${safeBaseName}.mp3`; // Nome final no ZIP será .mp3
                    } catch (convError) {
                        console.error(`[${index + 1}/${totalToProcess}] Erro na conversão: ${convError.message}`);
                        logStream.write(`Conversão: FALHA - ${convError.message}\n`);
                        failedConversions.push({ url: url, error: convError.message, format: 'mp3' });
                        // Decidir o que fazer em caso de falha na conversão:
                        // 1. Adicionar o arquivo GSM original ao ZIP? (Sim, é uma boa fallback)
                        finalFileNameInZip = `${safeBaseName}.gsm`; // Mantém o nome .gsm no ZIP
                        // 2. Pular este arquivo? (Não recomendado, pode frustrar o usuário)
                    }
                    // Limpar o arquivo GSM original APÓS a tentativa de conversão (sucesso ou falha)
                    try { await fs.remove(path.join(tempDir, `${uuidv4()}_${safeBaseName}.gsm`)); } catch (e) { console.warn("Erro ao limpar GSM original:", e.message); }
                }


                // 3. Adicionar arquivo (GSM ou MP3) ao arquivo ZIP
                console.log(`[${index + 1}/${totalToProcess}] Adicionando ao ZIP: ${downloadFilePath} como ${finalFileNameInZip}`);
                archive.file(downloadFilePath, { name: finalFileNameInZip });
                logStream.write(`Adicionado ao ZIP: ${finalFileNameInZip}\n`);

            } catch (downloadError) {
                console.error(`[${index + 1}/${totalToProcess}] Erro no download: ${downloadError.message}`);
                logStream.write(`Download: FALHA - ${downloadError.message}\n`);
                failedDownloads.push({ url: url, error: downloadError.message });
                // Não há arquivo para adicionar ao ZIP se o download falhou
            } finally {
                // Limpar o arquivo temporário (GSM ou MP3) após ser adicionado ao ZIP ou se o download falhou
                // Verifica se o arquivo temporário (GSM ou MP3) existe antes de tentar remover
                const tempFileExists = await fs.pathExists(downloadFilePath);
                if (tempFileExists) {
                    try {
                        await fs.remove(downloadFilePath);
                        console.log(`[${index + 1}/${totalToProcess}] Arquivo temporário limpo: ${downloadFilePath}`);
                    } catch (cleanError) {
                        console.warn(`[${index + 1}/${totalToProcess}] Erro ao limpar arquivo temporário ${downloadFilePath}:`, cleanError.message);
                    }
                }
                processedCount++;
                logStream.write(`Status: Processado. ${processedCount}/${totalToProcess}\n`);
                logStream.write(`---------------------------------------------\n`);
            }
        });

        // Executa as promises com o limite de concorrência
        await Promise.all(processingPromises);

        // Adiciona o arquivo de log ao ZIP
        logStream.end(); // Fecha o stream de log
        await new Promise(resolve => logStream.on('finish', resolve)); // Espera o stream de log fechar

        // Adiciona o arquivo de log ao ZIP
        console.log(`Adicionando arquivo de log ao ZIP: ${logFileName}`);
        archive.file(logFilePath, { name: logFileName });


        // Finaliza o arquivo ZIP
        console.log('Finalizando arquivo ZIP...');
        archive.finalize(); // Não precisa de await aqui, o evento 'close' do output stream indica que terminou

        // Espera o arquivo ZIP ser completamente escrito e fechado
        await zipFinished;

        console.log('Preparando resposta com o arquivo ZIP.');

        // Configura os headers da resposta para download
        res.setHeader('Content-Type', 'application/zip');
        // Define o nome do arquivo ZIP
        res.setHeader('Content-Disposition', `attachment; filename="widevoice_gravacoes_lote_${Date.now()}.zip"`);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition'); // Garante que o frontend possa ler Content-Disposition

        // Cria um stream de leitura do arquivo ZIP e envia como resposta
        const zipFileReadStream = fs.createReadStream(path.join(tempDir, 'gravacoes.zip'));
        zipFileReadStream.pipe(res); // Envia o ZIP como corpo da resposta

        console.log('Stream do arquivo ZIP iniciado para o frontend.');


        // Limpeza final do diretório temporário APÓS o stream de resposta terminar
        // O evento 'finish' ou 'close' na resposta (res) seria ideal, mas não são garantidos
        // para streams de pipe. O evento 'close' do output stream (que arquiver.pipe(output) usa)
        // é mais confiável para saber que o arquivamento terminou.
        // A limpeza deve ser feita após a resposta ter sido COMPLETAMENTE enviada ao cliente.
        // A forma mais segura aqui é confiar no evento 'finish' ou 'close' do 'output' stream
        // e adicionar um handler para limpar o diretório temporário.

        // Adiciona um handler para limpar o diretório temporário APÓS a resposta ser enviada
        // Este handler deve ser adicionado ao stream de RESPOSTA (res) ou ao stream do ARQUIVO ZIP lido.
        // O evento 'close' na resposta 'res' é o mais confiável para saber que a conexão com o cliente terminou.
        res.on('close', async () => {
            console.log('Conexão com o cliente fechada. Limpando diretório temporário...');
            try {
                const exists = await fs.pathExists(tempDir); // Usa pathExists
                if(exists) {
                    await fs.remove(tempDir);
                    console.log(`Diretório temporário ${tempDir} limpo após envio da resposta.`);
                }
            } catch (cleanError) {
                console.error(`Erro ao limpar diretório temporário ${tempDir} após envio da resposta:`, cleanError);
            }
        });


    } catch (processingError) {
        console.error('Erro geral no processamento do lote (antes ou durante arquivamento):', processingError);
        // Certifica-se de que o diretório temporário seja limpo em caso de erro
        try {
            const tempDirExists = await fs.pathExists(tempDir);
            if (tempDirExists) {
                await fs.remove(tempDir);
                console.log(`Diretório temporário ${tempDir} limpo após erro no processamento.`);
            }
        } catch (cleanError) {
            console.error(`Erro ao limpar diretório temporário ${tempDir} após erro no processamento (segundo catch):`, cleanError);
        }

        // Envia resposta de erro para o frontend APENAS se os cabeçalhos não foram enviados
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Erro interno do servidor ao processar o lote.',
                details: processingError.message,
                // Inclui as listas de falhas na resposta de erro para o frontend
                failedDownloads: failedDownloads.map(f => ({ url: f.url, error: f.error })),
                failedConversions: failedConversions.map(f => ({ url: f.url, error: f.error, format: f.format }))
            });
            console.log('Resposta 500 enviada ao frontend.');
        } else {
            console.error('Erro capturado após cabeçalhos enviados. Não é possível enviar status 500.', processingError);
            // Se os cabeçalhos já foram enviados (ex: durante o streaming do ZIP), não podemos enviar uma resposta JSON 500.
            // O cliente provavelmente receberá um download incompleto ou corrompido.
            // A melhor abordagem aqui é logar o erro e fechar a conexão se possível, mas não tentar enviar outra resposta.
            if (!res.finished) {
                res.end(); // Tenta finalizar a resposta pendente
            }
        }
    }
};

// Define a rota POST /download-batch que usa o handler
router.post('/', handleDownloadBatch);

module.exports = router; // Exporta o router