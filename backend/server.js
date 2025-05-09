const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Para Node.js < 18. Se usando Node.js >= 18, pode remover e usar o fetch global.
const fs = require('fs-extra'); // Para lidar com sistema de arquivos (criar diretórios recursivamente, limpar)
const path = require('path'); // Para lidar com caminhos de arquivos
const archiver = require('archiver'); // Para zipar arquivos
const os = require('os'); // Para obter o diretório temporário do sistema

const { convertGsmToMp3 } = require('./converter'); // Importa a função de conversão

const app = express();
const port = 3000; // Porta que o backend vai "ouvir". Ajuste se necessário.

// Middlewares
app.use(cors()); // Permite requisições de outras origens (seu frontend). Configurar origens específicas em produção é mais seguro.
app.use(express.json()); // Permite que o Express leia JSON no corpo das requisições.

// --- Rota para o download em lote ---
app.post('/download-batch', async (req, res) => {
    console.log('Requisição de download em lote recebida.');
    // O corpo da requisição é a lista de objetos { url: string, datahora: string } enviada pelo frontend
    // Agora também pode incluir a flag convertToMp3
    const { recordings, convertToMp3 } = req.body; // Extrai a lista de gravações e a flag

    console.log(`Converter para MP3 solicitado: ${!!convertToMp3}`); // Loga se a conversão foi solicitada

    // --- Validação inicial dos dados recebidos ---
    if (!recordings || !Array.isArray(recordings) || recordings.length === 0) {
        console.log('Nenhuma gravação válida fornecida na requisição.');
        // Resposta 400: Requisição inválida, corpo da requisição está incorreto
        return res.status(400).json({ error: 'Nenhuma lista de gravações válida fornecida no corpo da requisição.' });
    }

    console.log(`Recebidas ${recordings.length} gravações para processar.`);

    // --- Lógica de Download, Organização, Conversão (Opcional) e Zip ---

    // Cria um diretório temporário único para esta requisição no sistema do servidor
    const tempDir = path.join(os.tmpdir(), `widevoice_batch_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    console.log(`Criando diretório temporário: ${tempDir}`);

    // Variáveis para armazenar listas de falhas
    let failedDownloads = [];
    let failedConversions = []; // Nova lista para falhas de conversão

    try {
        await fs.ensureDir(tempDir);

        // --- Processo de Download e Conversão (Opcional) para Cada Gravação ---
        const processPromises = recordings.map(async (recording) => {
            const { url, datahora } = recording; // Extrai URL e data/hora

            const dateMatch = datahora.match(/^(\d{4})-(\d{2})-(\d{2})/);
            const datePath = dateMatch ? path.join(dateMatch[1], dateMatch[2], dateMatch[3]) : 'unknown_date';

            const filename = path.basename(url); // Nome original do arquivo GSM
            const filenameWithoutExt = path.parse(filename).name; // Nome do arquivo sem extensão
            const inputGsmPath = path.join(tempDir, datePath, filename); // Caminho temporário para o arquivo GSM
            const outputMp3Path = path.join(tempDir, datePath, `${filenameWithoutExt}.mp3`); // Caminho temporário para o arquivo MP3

            try {
                await fs.ensureDir(path.dirname(inputGsmPath)); // Garante que o diretório para o GSM exista

                // --- Baixa o arquivo da URL da gravação (sempre baixa o GSM original) ---
                console.log(`Tentando baixar: ${url}`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 segundos de timeout

                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorMsg = `HTTP Status ${response.status}`;
                    console.error(`Erro ao baixar ${url}: ${errorMsg}`);
                    // Registra a falha no download
                    failedDownloads.push({ url, datahora, error: errorMsg });
                    return null; // Retorna null para indicar que este item falhou o download
                }

                if (response.status === 204 || response.headers.get('Content-Length') === '0') {
                    const errorMsg = 'Resposta vazia (arquivo não encontrado ou vazio)';
                    console.error(`Erro ao baixar ${url}: ${errorMsg}`);
                    failedDownloads.push({ url, datahora, error: errorMsg });
                    return null;
                }

                // Salva o arquivo GSM baixado temporariamente
                const fileStream = fs.createWriteStream(inputGsmPath);
                await new Promise((resolve, reject) => {
                    response.body.pipe(fileStream);
                    fileStream.on('finish', resolve);
                    fileStream.on('error', reject);
                });

                console.log(`Download concluído: ${filename}`);

                // --- Processo de Conversão (SE solicitado) ---
                if (convertToMp3) {
                    try {
                        // Garante que o diretório para o MP3 exista
                        await fs.ensureDir(path.dirname(outputMp3Path));
                        // Chama a função de conversão
                        await convertGsmToMp3(inputGsmPath, outputMp3Path);

                        // Opcional: Remover o arquivo GSM original após a conversão bem-sucedida para economizar espaço temporário
                        // await fs.remove(inputGsmPath);
                        // console.log(`Arquivo GSM original removido: ${path.basename(inputGsmPath)}`);

                        // Retorna o caminho do arquivo MP3 para ser incluído no ZIP
                        return { url, datahora, success: true, finalPath: outputMp3Path, originalFormat: 'gsm', convertedTo: 'mp3' };

                    } catch (conversionError) {
                        const errorMsg = conversionError.message;
                        console.error(`Erro na conversão de ${filename} para MP3: ${errorMsg}`);
                        // Registra a falha na conversão
                        failedConversions.push({ url, datahora, error: errorMsg, format: 'gsm_to_mp3' });
                        // *** Importante: Em caso de falha na conversão, você pode escolher: ***
                        // 1. Incluir o arquivo GSM original no ZIP: return { url, datahora, success: true, finalPath: inputGsmPath, originalFormat: 'gsm', convertedTo: null, warning: 'Conversão falhou' };
                        // 2. Não incluir o arquivo de forma alguma: return null;
                        // Vamos escolher a opção 1: incluir o GSM original com aviso.
                        console.warn(`Incluindo o arquivo GSM original (${path.basename(inputGsmPath)}) no ZIP devido a falha na conversão.`);
                        return { url, datahora, success: true, finalPath: inputGsmPath, originalFormat: 'gsm', convertedTo: null, warning: 'Conversão para MP3 falhou' };
                    }
                } else {
                    // Se a conversão NÃO foi solicitada, retorna o caminho do arquivo GSM original para o ZIP
                    return { url, datahora, success: true, finalPath: inputGsmPath, originalFormat: 'gsm', convertedTo: null };
                }


            } catch (processError) {
                // Trata erros durante o fetch ou durante a escrita do arquivo GSM
                let errorMsg = processError.message;
                if (processError.name === 'AbortError') {
                    errorMsg = 'Timeout do download';
                }
                console.error(`Erro no processamento do arquivo ${filename} (${url}): ${errorMsg}`);
                // Registra a falha no download
                failedDownloads.push({ url, datahora, error: errorMsg });
                return null; // Retorna null para indicar falha no download
            }
        });

        // Executa todas as Promises de download/conversão em paralelo
        const processResults = await Promise.all(processPromises);

        // Filtra os resultados para obter apenas os bem-sucedidos (que retornaram um objeto, não null)
        const successfulItems = processResults.filter(result => result !== null);

        console.log(`Itens processados com sucesso (download e conversão opcional): ${successfulItems.length}`);
        console.log(`Downloads falhos: ${failedDownloads.length}`);
        console.log(`Conversões falhas: ${failedConversions.length}`);


        // --- Cenário 1: Nenhum item foi processado com sucesso ---
        if (successfulItems.length === 0) {
            console.log('Nenhum arquivo disponível para zipar após processamento.');
            // Limpa o diretório temporário
            try {
                await fs.remove(tempDir);
                console.log('Diretório temporário limpo após falha total de processamento.');
            } catch (cleanError) {
                console.error('Erro ao limpar diretório temporário após falha total:', cleanError);
            }

            // *** Resposta 404: Nenhum recurso (arquivo) foi processado para criar o ZIP ***
            // Inclui todas as falhas (download e conversão) no corpo JSON
            return res.status(404).json({
                error: 'Nenhum arquivo baixado ou convertido com sucesso para criar o ZIP.',
                failedDownloads: failedDownloads.map(f => ({ url: f.url, error: f.error })),
                failedConversions: failedConversions.map(f => ({ url: f.url, error: f.error, format: f.format }))
            });
        }

        // --- Cenário 2: Pelo menos um item foi processado com sucesso (Criação e envio do ZIP) ---

        console.log('Iniciando criação do arquivo ZIP...');
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        // Define o nome do arquivo ZIP
        const now = new Date();
        const zipFilename = `gravações_widevoice_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}${convertToMp3 ? '_mp3' : ''}.zip`; // Adiciona _mp3 se convertido
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
        res.setHeader('Content-Type', 'application/zip');


        archive.pipe(res);

        // Adiciona os arquivos processados com sucesso (sejam GSM ou MP3) ao arquivo ZIP
        successfulItems.forEach(item => {
            // Calcula o caminho relativo dentro do ZIP (mantendo a estrutura de pastas de data)
            const relativePath = path.relative(tempDir, item.finalPath);
            console.log(`Adicionando ao ZIP: ${item.finalPath} como ${relativePath}`);
            archive.file(item.finalPath, { name: relativePath });
        });


        // --- Adiciona um arquivo de log de falhas ao ZIP, se houver downloads OU conversões falhas ---
        if (failedDownloads.length > 0 || failedConversions.length > 0 || successfulItems.some(item => item.warning)) {
            console.warn(`Adicionando log de falhas/avisos ao ZIP. Downloads falhos: ${failedDownloads.length}, Conversões falhas: ${failedConversions.length}, Itens com aviso: ${successfulItems.filter(item => item.warning).length}`);
            let logContent = 'Relatório de Processamento do Lote de Gravações:\n\n';

            if (failedDownloads.length > 0) {
                logContent += `--- Downloads Falhos (${failedDownloads.length}) ---\n`;
                failedDownloads.forEach(fail => {
                    logContent += `URL: ${fail.url}\n`;
                    logContent += `Data/Hora: ${fail.datahora}\n`;
                    logContent += `Erro: ${fail.error || 'Erro desconhecido'}\n`;
                    logContent += '---\n';
                });
                logContent += '\n'; // Adiciona linha em branco entre seções
            }

            if (failedConversions.length > 0) {
                logContent += `--- Conversões Falhas (${failedConversions.length}) ---\n`;
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


            // Adiciona o conteúdo do log como um arquivo dentro do arquivo ZIP
            archive.append(logContent, { name: 'processamento_relatorio.log' });
        }


        archive.finalize();

        console.log('Arquivamento iniciado. Enviando ZIP para o frontend...');


        // --- Lidar com eventos do arquivador e da resposta ---
        archive.on('warning', function(err) {
            if (err.code === 'ENOENT') {
                console.warn('Archiver Warning (Arquivo não encontrado no temp durante zipagem?):', err.message);
            } else {
                console.error('Archiver Warning:', err);
            }
        });

        archive.on('error', function(err) {
            console.error('Archiver Error:', err);
            // Se ocorrer um erro fatal no arquivador APÓS o pipe ter sido feito,
            // a conexão com o frontend será provavelmente encerrada de forma abrupta.
            // Não podemos enviar um status de erro HTTP aqui (os cabeçalhos 200 já foram enviados).
        });

        // --- Lógica para Limpar o Diretório Temporário ---
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
            if (!res.finished) { // Se a resposta não terminou quando a conexão fechou
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
});


// --- Inicia o servidor ---
app.listen(port, () => {
    console.log(`Backend rodando em http://localhost:${port}`);
    console.log('Aguardando requisições de download em lote...');
    console.log('Certifique-se de que o FFmpeg está instalado e acessível no PATH do servidor para conversão MP3.');
});