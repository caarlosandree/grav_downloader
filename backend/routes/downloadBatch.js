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
    const { recordings, convertToMp3 } = req.body;

    console.log(`Converter para MP3 solicitado: ${!!convertToMp3}`);

    if (!recordings || !Array.isArray(recordings) || recordings.length === 0) {
        console.log('Nenhuma gravação válida fornecida na requisição.');
        return res.status(400).json({ error: 'Nenhuma lista de gravações válida fornecida no corpo da requisição.' });
    }

    console.log(`Recebidas ${recordings.length} gravações para processar.`);

    const tempDir = path.join(os.tmpdir(), `widevoice_batch_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    console.log(`Criando diretório temporário: ${tempDir}`);

    let failedDownloads = [];
    let failedConversions = [];
    let warnings = []; // Para itens baixados/convertidos mas com algum aviso


    try {
        await fs.ensureDir(tempDir);

        const processPromises = recordings.map(async (recording) => {
            const { url, datahora, src, dst, duration } = recording; // Usa os campos adicionais

            const dateMatch = datahora.match(/^(\d{4})-(\d{2})-(\d{2})/);
            const datePath = dateMatch ? path.join(dateMatch[1], dateMatch[2], dateMatch[3]) : 'unknown_date';

            const filename = path.basename(url);
            const filenameWithoutExt = path.parse(filename).name;
            const inputGsmPath = path.join(tempDir, datePath, filename);
            const outputMp3Path = path.join(tempDir, datePath, `${filenameWithoutExt}.mp3`);

            // Tenta criar um nome de arquivo descritivo (refeito aqui também para o log de aviso)
            const timeMatch = datahora ? datahora.match(/\d{2}:\d{2}:\d{2}$/) : null;
            const time = timeMatch ? timeMatch[0].replace(/:/g, '') : 'HHMMSS';
            const cleanSrc = src ? src.replace(/[^a-zA-Z0-9_-]/g, '') : 'N/A';
            const cleanDst = dst ? dst.replace(/[^a-zA-Z0-9_-]/g, '') : 'N/A';
            const cleanDuration = duration ? duration.replace(/[^0-9]/g, '') : 'N/A';

            let suggestedFileNameBase = `${dateMatch ? dateMatch[1] + dateMatch[2] + dateMatch[3] : 'AAAA'}_${time}`;
            if (cleanSrc !== 'N/A') suggestedFileNameBase += `_de_${cleanSrc}`;
            if (cleanDst !== 'N/A') suggestedFileNameBase += `_para_${cleanDst}`;
            if (cleanDuration !== 'N/A') suggestedFileNameBase += `_dur${cleanDuration}s`;
            suggestedFileNameBase = suggestedFileNameBase.replace(/[\\/:*?"<>|]/g, '_');


            try {
                await fs.ensureDir(path.dirname(inputGsmPath));

                console.log(`Tentando baixar: ${url}`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 segundos de timeout

                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorBody = await response.text().catch(() => 'N/A');
                    const errorMsg = `HTTP Status ${response.status} - ${errorBody}`;
                    console.error(`Erro ao baixar ${url}: ${errorMsg}`);
                    failedDownloads.push({ url, datahora, error: errorMsg });
                    return null;
                }

                if (response.status === 204 || response.headers.get('Content-Length') === '0') {
                    const errorMsg = 'Resposta vazia (arquivo não encontrado ou vazio)';
                    console.error(`Erro ao baixar ${url}: ${errorMsg}`);
                    failedDownloads.push({ url, datahora, error: errorMsg });
                    return null;
                }


                const fileStream = fs.createWriteStream(inputGsmPath);
                await new Promise((resolve, reject) => {
                    response.body.pipe(fileStream);
                    fileStream.on('finish', resolve);
                    fileStream.on('error', reject);
                });

                console.log(`Download concluído: ${filename}`);

                if (convertToMp3) {
                    try {
                        await fs.ensureDir(path.dirname(outputMp3Path));
                        await convertGsmToMp3(inputGsmPath, outputMp3Path);

                        return { url, datahora, success: true, finalPath: outputMp3Path, originalFormat: 'gsm', convertedTo: 'mp3', suggestedFileNameBase: suggestedFileNameBase };

                    } catch (conversionError) {
                        const errorMsg = conversionError.message;
                        console.error(`Falha na conversão de ${filename} para MP3: ${errorMsg}`);
                        failedConversions.push({ url, datahora, error: errorMsg, format: 'gsm_to_mp3' });
                        warnings.push(`Conversão MP3 falhou para ${filename}. Incluindo arquivo original (.gsm) no ZIP.`);
                        return { url, datahora, success: true, finalPath: inputGsmPath, originalFormat: 'gsm', convertedTo: null, warning: 'Conversão para MP3 falhou', suggestedFileNameBase: suggestedFileNameBase };
                    }
                } else {
                    return { url, datahora, success: true, finalPath: inputGsmPath, originalFormat: 'gsm', convertedTo: null, suggestedFileNameBase: suggestedFileNameBase };
                }


            } catch (processError) {
                let errorMsg = processError.message;
                if (processError.name === 'AbortError') {
                    errorMsg = 'Timeout do download';
                }
                const fullErrorMessage = `Erro no processamento do arquivo ${filename} (${url}): ${errorMsg}`;
                console.error(fullErrorMessage, processError);
                if (!failedDownloads.find(f => f.url === url)) { // Evita duplicar
                    failedDownloads.push({ url, datahora, error: fullErrorMessage });
                }
                return null;
            }
        });

        const processResults = await Promise.all(processPromises);
        const successfulItems = processResults.filter(result => result !== null);

        console.log(`Itens processados com sucesso (download e conversão opcional): ${successfulItems.length}`);
        console.log(`Downloads falhos: ${failedDownloads.length}`);
        console.log(`Conversões falhas: ${failedConversions.length}`);


        if (successfulItems.length === 0) {
            console.log('Nenhum arquivo disponível para zipar após processamento.');
            try {
                await fs.remove(tempDir);
                console.log('Diretório temporário limpo após falha total de processamento.');
            } catch (cleanError) {
                console.error('Erro ao limpar diretório temporário após falha total:', cleanError);
            }

            return res.status(404).json({
                error: 'Nenhum arquivo baixado ou convertido com sucesso para criar o ZIP.',
                failedDownloads: failedDownloads.map(f => ({ url: f.url, error: f.error })),
                failedConversions: failedConversions.map(f => ({ url: f.url, error: f.error, format: f.format }))
            });
        }

        console.log('Iniciando criação do arquivo ZIP...');
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        const now = new Date();
        const zipFilename = `gravações_widevoice_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}${convertToMp3 ? '_mp3' : ''}.zip`;
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
        res.setHeader('Content-Type', 'application/zip');


        archive.pipe(res);

        successfulItems.forEach(item => {
            // Calcula o caminho dentro do ZIP usando o nome descritivo
            const relativePath = path.relative(tempDir, item.finalPath);
            const dirInZip = path.dirname(relativePath); // A pasta dentro do ZIP
            const fileNameInZip = `${item.suggestedFileNameBase}${path.extname(item.finalPath).toLowerCase()}`; // Nome descritivo com a extensão final
            const finalZipEntryName = path.join(dirInZip, fileNameInZip); // Caminho final dentro do ZIP

            console.log(`Adicionando ao ZIP: ${item.finalPath} como ${finalZipEntryName}`);
            archive.file(item.finalPath, { name: finalZipEntryName });
        });


        if (failedDownloads.length > 0 || failedConversions.length > 0 || warnings.length > 0) {
            console.warn(`Adicionando log de falhas/avisos ao ZIP.`);
            let logContent = 'Relatório de Processamento do Lote de Gravações:\n\n';

            logContent += `Total de gravações solicitadas: ${recordings.length}\n`;
            logContent += `Converte para MP3 solicitado: ${convertToMp3 ? 'Sim' : 'Não'}\n\n`;

            if (failedDownloads.length > 0) {
                logContent += `--- Falhas de Download (${failedDownloads.length}) ---\n`;
                failedDownloads.forEach(fail => {
                    logContent += `URL: ${fail.url}\n`;
                    logContent += `Data/Hora: ${fail.datahora}\n`;
                    logContent += `Erro: ${fail.error || 'Erro desconhecido'}\n`;
                    logContent += '---\n';
                });
                logContent += '\n';
            }

            if (failedConversions.length > 0) {
                logContent += `--- Falhas de Conversão (${failedConversions.length}) ---\n`;
                failedConversions.forEach(fail => {
                    logContent += `URL Original: ${fail.url}\n`;
                    logContent += `Data/Hora: ${fail.datahora}\n`;
                    logContent += `Formato: ${fail.format}\n`;
                    logContent += `Erro: ${fail.error || 'Erro desconhecido'}\n`;
                    logContent += '---\n';
                });
                logContent += '\n';
            }

            const itemsWithWarning = successfulItems.filter(item => item.warning);
            if (itemsWithWarning.length > 0) {
                logContent += `--- Itens Processados com Avisos (${itemsWithWarning.length}) ---\n`;
                itemsWithWarning.forEach(item => {
                    logContent += `URL Original: ${item.url}\n`;
                    logContent += `Data/Hora: ${item.datahora}\n`;
                    logContent += `Arquivo Incluído no ZIP: ${path.basename(item.finalPath)}\n`;
                    logContent += `Aviso: ${item.warning}\n`;
                    logContent += '---\n';
                });
                logContent += '\n';
            }


            archive.append(logContent, { name: 'processamento_relatorio.log' });
            console.log('Arquivo processamento_relatorio.log adicionado ao ZIP.');
        }


        archive.finalize();

        console.log('Arquivamento finalizado. Enviando ZIP para o frontend...');

        res.on('finish', async () => {
            console.log(`Resposta enviada com sucesso. Limpando diretório temporário: ${tempDir}`);
            try {
                const exists = await fs.exists(tempDir);
                if(exists) {
                    await fs.remove(tempDir);
                    console.log('Diretório temporário limpo.');
                }
            } catch (cleanError) {
                console.error('Erro ao limpar diretório temporário após envio:', cleanError);
            }
        });

        res.on('close', async () => {
            if (!res.finished) {
                console.warn(`Conexão fechada prematuramente. Limpando diretório temporário: ${tempDir}`);
                try {
                    const exists = await fs.exists(tempDir);
                    if(exists) {
                        await fs.remove(tempDir);
                        console.log('Diretório temporário limpo após fechamento prematuro da conexão.');
                    }
                } catch (cleanError) {
                    console.error('Erro ao limpar diretório temporário após fechamento da conexão:', cleanError);
                }
            }
        });


    } catch (processingError) {
        console.error('Erro geral no processamento do lote (antes ou durante arquivamento):', processingError);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Erro interno do servidor ao processar o lote.',
                details: processingError.message,
                failedDownloads: failedDownloads.map(f => ({ url: f.url, error: f.error })),
                failedConversions: failedConversions.map(f => ({ url: f.url, error: f.error, format: f.format }))
            });
            console.log('Resposta 500 enviada ao frontend.');
        } else {
            console.error('Erro capturado após cabeçalhos enviados. Não é possível enviar status 500.', processingError);
        }
    }
};

// Define a rota POST /download-batch que usa o handler
router.post('/', handleDownloadBatch);

module.exports = router; // Exporta o router