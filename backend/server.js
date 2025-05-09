const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Para Node.js < 18. Se usando Node.js >= 18, pode remover e usar o fetch global.
const fs = require('fs-extra'); // Para lidar com sistema de arquivos (criar diretórios recursivamente, limpar)
const path = require('path'); // Para lidar com caminhos de arquivos
const archiver = require('archiver'); // Para zipar arquivos
const os = require('os'); // Para obter o diretório temporário do sistema

const app = express();
const port = 3000; // Porta que o backend vai "ouvir"

// Middlewares
app.use(cors()); // Permite requisições de outras origens (seu frontend)
app.use(express.json()); // Permite que o Express leia JSON no corpo das requisições

// --- Rota para o download em lote ---
app.post('/download-batch', async (req, res) => {
    console.log('Requisição de download em lote recebida.');
    const recordings = req.body;

    if (!recordings || !Array.isArray(recordings) || recordings.length === 0) {
        console.log('Nenhuma gravação fornecida na requisição.');
        return res.status(400).json({ error: 'Nenhuma gravação fornecida.' });
    }

    console.log(`Recebidas ${recordings.length} gravações para processar.`);

    const tempDir = path.join(os.tmpdir(), `widevoice_batch_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    console.log(`Criando diretório temporário: ${tempDir}`);

    try {
        await fs.ensureDir(tempDir);

        const downloadPromises = recordings.map(async (recording) => {
            const { url, datahora } = recording;
            const dateMatch = datahora.match(/^(\d{4})-(\d{2})-(\d{2})/);
            const datePath = dateMatch ? path.join(dateMatch[1], dateMatch[2], dateMatch[3]) : 'unknown_date';
            const filename = path.basename(url);
            const destDir = path.join(tempDir, datePath);
            const destPath = path.join(destDir, filename);

            try {
                await fs.ensureDir(destDir);
                console.log(`Tentando baixar: ${url}`);
                const response = await fetch(url);

                if (!response.ok) {
                    const errorMsg = `HTTP Status ${response.status}`;
                    console.error(`Erro ao baixar ${url}: ${errorMsg}`);
                    return { url, success: false, error: errorMsg };
                }

                const fileStream = fs.createWriteStream(destPath);
                await new Promise((resolve, reject) => {
                    response.body.pipe(fileStream);
                    fileStream.on('finish', resolve);
                    fileStream.on('error', reject);
                });

                console.log(`Download concluído: ${filename}`);
                return { url, success: true, destPath };

            } catch (downloadError) {
                console.error(`Erro no processamento do arquivo ${filename} (${url}):`, downloadError);
                return { url, success: false, error: downloadError.message };
            }
        });

        const downloadResults = await Promise.all(downloadPromises);

        const successfulDownloads = downloadResults.filter(result => result.success);
        const failedDownloads = downloadResults.filter(result => !result.success);

        console.log(`Downloads bem-sucedidos: ${successfulDownloads.length}`);
        console.log(`Downloads falhos: ${failedDownloads.length}`);

        // --- Cria o arquivo ZIP ---
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        // Configura os cabeçalhos da resposta
        res.setHeader('Content-Type', 'application/zip');
        const now = new Date();
        const zipFilename = `gravações_widevoice_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}.zip`;
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

        // Pipe o arquivador para a resposta
        archive.pipe(res);

        // Adiciona os arquivos baixados com sucesso ao ZIP
        if (successfulDownloads.length > 0) {
            // Adiciona todo o conteúdo do diretório temporário (que já tem as pastas de data)
            archive.directory(tempDir, false);
        }

        // --- Adiciona um arquivo de log de falhas ao ZIP, se houver ---
        if (failedDownloads.length > 0) {
            console.warn(`Adicionando log de ${failedDownloads.length} downloads falhos ao ZIP.`);
            let logContent = 'Os seguintes downloads falharam:\n\n';
            failedDownloads.forEach(fail => {
                logContent += `URL: ${fail.url}\n`;
                logContent += `Erro: ${fail.error || 'Erro desconhecido'}\n`;
                logContent += '---\n';
            });
            // Adiciona o conteúdo do log como um arquivo dentro do ZIP
            archive.append(logContent, { name: 'failed_downloads.log' });
        } else if (successfulDownloads.length === 0) {
             // Se não houve sucesso nem falhas (lista vazia, mas isso foi checado no início),
             // ou se todos falharam, mas nenhum teve sucesso para zipar nada.
             // Este caso deve ser pego pelo check successfulDownloads.length === 0 acima.
             // Mas adicionamos um log no zip caso algo inesperado aconteça.
             archive.append('Nenhuma gravação baixada com sucesso.', { name: 'download_status.log' });
        }


        // Finaliza o arquivo.
        archive.finalize();

        console.log('Arquivamento iniciado. Enviando ZIP para o frontend...');

        // --- Lidar com eventos do arquivador e da resposta ---
        archive.on('warning', function(err) {
          if (err.code === 'ENOENT') {
            console.warn('Archiver Warning:', err.message);
          } else {
            console.error('Archiver Warning:', err);
          }
        });

        archive.on('error', function(err) {
           console.error('Archiver Error:', err);
           // Erro fatal no archiver após pipe - a conexão pode ser encerrada
           // O frontend deve detectar isso.
        });

        // Limpa o diretório temporário
        res.on('finish', async () => {
            console.log(`Resposta enviada. Limpando diretório temporário: ${tempDir}`);
            try {
                 await fs.remove(tempDir);
                 console.log('Diretório temporário limpo.');
            } catch (cleanError) {
                 console.error('Erro ao limpar diretório temporário após envio:', cleanError);
            }
        });

        res.on('close', async () => {
             if (!res.finished) {
                 console.warn(`Conexão fechada prematuramente. Limpando diretório temporário: ${tempDir}`);
                 try {
                      await fs.remove(tempDir);
                      console.log('Diretório temporário limpo após fechamento da conexão.');
                 } catch (cleanError) {
                      console.error('Erro ao limpar diretório temporário após fechamento da conexão:', cleanError);
                 }
             }
        });


    } catch (processingError) {
        console.error('Erro geral no processamento do lote (antes ou durante arquivamento):', processingError);
        // Se o erro ocorreu antes de enviar cabeçalhos, podemos enviar status 500
        if (!res.headersSent) {
             // Tenta garantir que a resposta de erro seja JSON
             res.status(500).json({ error: 'Erro interno do servidor ao processar o lote.', details: processingError.message });
        } else {
             console.error('Erro capturado após cabeçalhos enviados.', processingError);
             // Se os cabeçalhos já foram enviados, não podemos enviar status 500.
             // A conexão provavelmente será encerrada.
        }

    }
    // Não precisamos de finally aqui para limpeza, pois usamos eventos na resposta (res.on('finish'/'close'))
});


// --- Inicia o servidor ---
app.listen(port, () => {
    console.log(`Backend rodando em http://localhost:${port}`);
    console.log('Aguardando requisições de download em lote...');
});