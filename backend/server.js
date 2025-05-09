const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Para Node.js < 18. Se usando Node.js >= 18, pode remover e usar o fetch global.
const fs = require('fs-extra'); // Para lidar com sistema de arquivos (criar diretórios recursivamente, limpar)
const path = require('path'); // Para lidar com caminhos de arquivos
const archiver = require('archiver'); // Para zipar arquivos
const os = require('os'); // Para obter o diretório temporário do sistema

const app = express();
const port = 3000; // Porta que o backend vai "ouvir". Ajuste se necessário.

// Middlewares
app.use(cors()); // Permite requisições de outras origens (seu frontend). Configurar origens específicas em produção é mais seguro.
app.use(express.json()); // Permite que o Express leia JSON no corpo das requisições.

// --- Rota para o download em lote ---
app.post('/download-batch', async (req, res) => {
    console.log('Requisição de download em lote recebida.');
    // O corpo da requisição é a lista de objetos { url: string, datahora: string } enviada pelo frontend
    const recordings = req.body;

    // --- Validação inicial dos dados recebidos ---
    if (!recordings || !Array.isArray(recordings) || recordings.length === 0) {
        console.log('Nenhuma gravação válida fornecida na requisição.');
        // Resposta 400: Requisição inválida, corpo da requisição está incorreto
        return res.status(400).json({ error: 'Nenhuma lista de gravações válida fornecida no corpo da requisição.' });
    }

    console.log(`Recebidas ${recordings.length} gravações para processar.`);

    // --- Lógica de Download, Organização e Zip ---

    // Cria um diretório temporário único para esta requisição no sistema do servidor
    // Usa Date.now() e um string aleatória para garantir unicidade
    const tempDir = path.join(os.tmpdir(), `widevoice_batch_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    console.log(`Criando diretório temporário: ${tempDir}`);

    // Variável para armazenar a lista de downloads que falharam
    let failedDownloads = [];

    try {
        // Garante que o diretório temporário principal exista
        await fs.ensureDir(tempDir);

        // --- Processo de Download Individual para Cada Gravação ---
        const downloadPromises = recordings.map(async (recording) => {
            const { url, datahora } = recording; // Extrai URL e data/hora do objeto recebido

            // --- Extrai a data no formato YYYY/MM/DD para a estrutura de pastas ---
            // Assume que datahora está no formato YYYY-MM-DD HH:mm:ss
            const dateMatch = datahora.match(/^(\d{4})-(\d{2})-(\d{2})/); // Regex para YYYY-MM-DD
            // Constrói o caminho da pasta baseado na data (ex: 2025/05/08)
            // Usa 'unknown_date' se o formato de data não for o esperado
            const datePath = dateMatch ? path.join(dateMatch[1], dateMatch[2], dateMatch[3]) : 'unknown_date';

            // --- Extrai o nome do arquivo da URL ---
            // path.basename é uma forma segura de obter o nome do arquivo da URL
            const filename = path.basename(url);
            // Opcional: Adicionar um identificador único ao nome do arquivo se houver risco de nomes duplicados
            // Ex: const filename = `${path.basename(url, path.extname(url))}_${Date.now()}${path.extname(url)}`;

            // --- Constrói o caminho completo de destino no diretório temporário do servidor ---
            const destDir = path.join(tempDir, datePath); // Diretório de destino com as pastas de data
            const destPath = path.join(destDir, filename); // Caminho completo onde o arquivo será salvo

            try {
                // Garante que o diretório de destino baseado na data exista. Cria se necessário.
                await fs.ensureDir(destDir);

                // --- Baixa o arquivo da URL da gravação ---
                console.log(`Tentando baixar: ${url}`);
                // Usa o fetch apropriado (node-fetch para Node.js < 18, ou o fetch global para >= 18)
                // Adiciona um AbortController e timeout para evitar que downloads travados bloquem tudo
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 segundos de timeout por arquivo

                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId); // Limpa o timeout se o fetch completar antes

                // Verifica se a requisição HTTP para a gravação foi bem-sucedida (status 2xx)
                if (!response.ok) {
                    const errorMsg = `HTTP Status ${response.status}`;
                    console.error(`Erro ao baixar ${url}: ${errorMsg}`);
                    // Retorna informações sobre a falha
                    return { url, success: false, error: errorMsg };
                }

                // Verifica se a resposta tem um corpo válido (não é apenas um erro HTTP sem conteúdo, ex: 204 No Content)
                if (response.status === 204 || response.headers.get('Content-Length') === '0') {
                    const errorMsg = 'Resposta vazia (arquivo não encontrado ou vazio)';
                    console.error(`Erro ao baixar ${url}: ${errorMsg}`);
                    return { url, success: false, error: errorMsg };
                }

                // --- Salva o corpo da resposta (conteúdo do arquivo) no sistema de arquivos do servidor ---
                const fileStream = fs.createWriteStream(destPath);

                // Pipe a resposta do download (stream de leitura) para o stream de escrita do arquivo
                // Cria uma Promise para esperar a conclusão da escrita do arquivo
                await new Promise((resolve, reject) => {
                    response.body.pipe(fileStream);
                    fileStream.on('finish', resolve); // Resolve a promise quando a escrita terminar
                    fileStream.on('error', reject); // Rejeita a promise em caso de erro na escrita
                });

                console.log(`Download concluído: ${filename}`);
                return { url, success: true, destPath }; // Retorna sucesso e o caminho onde foi salvo

            } catch (downloadError) {
                // Trata erros durante o fetch (rede, timeout) ou durante a escrita do arquivo
                let errorMsg = downloadError.message;
                if (downloadError.name === 'AbortError') {
                    errorMsg = 'Timeout do download';
                }
                console.error(`Erro no processamento do arquivo ${filename} (${url}): ${errorMsg}`);
                return { url, success: false, error: errorMsg };
            }
        });

        // Executa todas as Promises de download em paralelo e espera que todas terminem
        // Promise.all espera que todas as promises no array terminem (resolvam ou rejeitem)
        // A lista 'downloadResults' terá um objeto para cada download original
        const downloadResults = await Promise.all(downloadPromises);

        // Filtra os resultados para separar downloads bem-sucedidos e falhos
        const successfulDownloads = downloadResults.filter(result => result.success);
        failedDownloads = downloadResults.filter(result => !result.success); // Atualiza a lista global de falhas

        console.log(`Downloads bem-sucedidos: ${successfulDownloads.length}`);
        console.log(`Downloads falhos: ${failedDownloads.length}`);

        // --- Cenário 1: Nenhum download foi bem-sucedido ---
        if (successfulDownloads.length === 0) {
            console.log('Nenhum arquivo baixado com sucesso para zipar.');
            // Limpa o diretório temporário imediatamente, pois não há arquivos para zipar/enviar
            try {
                await fs.remove(tempDir); // Remove o diretório e todo o seu conteúdo
                console.log('Diretório temporário limpo após falha total de download.');
            } catch (cleanError) {
                console.error('Erro ao limpar diretório temporário após falha total:', cleanError);
            }

            // *** Resposta 404: Nenhum recurso (arquivo) foi encontrado para criar o ZIP ***
            // Inclui a lista de falhas no corpo JSON da resposta para o frontend
            return res.status(404).json({
                error: 'Nenhum arquivo baixado com sucesso para criar o ZIP.',
                failedDownloads: failedDownloads.map(f => ({ url: f.url, error: f.error })) // Envia lista simplificada
            });
        }

        // --- Cenário 2: Pelo menos um download foi bem-sucedido (Criação e envio do ZIP) ---
        // Esta parte só é executada se successfulDownloads.length > 0

        console.log('Iniciando criação do arquivo ZIP...');
        // Cria uma nova instância do arquivador no formato zip
        const archive = archiver('zip', {
            zlib: { level: 9 } // Nível de compressão (0 a 9)
        });

        // --- Configura os cabeçalhos da resposta HTTP para enviar um arquivo ZIP ---
        res.setHeader('Content-Type', 'application/zip');
        // Define o nome do arquivo ZIP que o navegador vai baixar
        const now = new Date();
        const zipFilename = `gravações_widevoice_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}.zip`;
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`); // Instrução para o navegador baixar

        // Pipe o arquivo ZIP gerado diretamente para o stream de resposta HTTP
        // À medida que o arquivador compacta, os dados são enviados ao navegador em chunks
        archive.pipe(res);

        // Adiciona os arquivos do diretório temporário ao arquivo ZIP
        // O primeiro argumento é o caminho local no servidor (o diretório temporário que contém as pastas de data)
        // O segundo argumento (false) significa não incluir o diretório tempDir raiz no zip,
        // apenas o conteúdo dentro dele (que já inclui as pastas YYYY/MM/DD/)
        archive.directory(tempDir, false);

        // --- Adiciona um arquivo de log de falhas ao ZIP, se houver ---
        if (failedDownloads.length > 0) {
            console.warn(`Adicionando log de ${failedDownloads.length} downloads falhos ao ZIP.`);
            let logContent = 'Os seguintes downloads falharam durante o processamento:\n\n';
            failedDownloads.forEach(fail => {
                logContent += `URL: ${fail.url}\n`;
                logContent += `Erro: ${fail.error || 'Erro desconhecido'}\n`;
                logContent += '---\n';
            });
            // Adiciona o conteúdo do log como um arquivo chamado 'failed_downloads.log' dentro do arquivo ZIP
            archive.append(logContent, { name: 'failed_downloads.log' });
        }


        // --- Finaliza o arquivo ZIP ---
        // Quando isso terminar, o stream da resposta será fechado, indicando o fim do envio.
        archive.finalize();

        console.log('Arquivamento iniciado. Enviando ZIP para o frontend...');


        // --- Lidar com eventos do arquivador e da resposta ---
        // Loga avisos durante o processo de arquivamento
        archive.on('warning', function(err) {
            if (err.code === 'ENOENT') {
                console.warn('Archiver Warning (Arquivo não encontrado no temp?):', err.message);
            } else {
                console.error('Archiver Warning:', err);
            }
        });

        // Loga erros fatais durante o processo de arquivamento
        archive.on('error', function(err) {
            console.error('Archiver Error:', err);
            // Se ocorrer um erro fatal no arquivador APÓS o pipe ter sido feito,
            // a conexão com o frontend será provavelmente encerrada de forma abrupta.
            // Não podemos enviar um status de erro HTTP aqui (os cabeçalhos 200 já foram enviados).
            // O frontend pode detectar isso como um erro de rede ou um download incompleto.
        });

        // --- Lógica para Limpar o Diretório Temporário ---
        // Usa eventos na resposta HTTP para garantir que a limpeza ocorra APÓS o envio (sucesso ou falha)
        // res.on('finish') é disparado quando a resposta foi completamente enviada e a conexão fechada normalmente.
        res.on('finish', async () => {
            console.log(`Resposta enviada com sucesso. Limpando diretório temporário: ${tempDir}`);
            try {
                // Verifica se o diretório temporário ainda existe antes de tentar removê-lo
                // (Pode ter sido limpo em caso de falha total mais cedo)
                const exists = await fs.exists(tempDir);
                if(exists) {
                    await fs.remove(tempDir); // Remove o diretório e todo o seu conteúdo recursivamente
                    console.log('Diretório temporário limpo.');
                }
            } catch (cleanError) {
                console.error('Erro ao limpar diretório temporário após envio:', cleanError);
            }
        });

        // res.on('close') é disparado quando a conexão com o cliente é fechada por qualquer motivo,
        // incluindo sucesso, erro ou interrupção pelo cliente.
        // Verifica se a resposta terminou ('finished') para evitar limpar duas vezes no caso de sucesso normal.
        res.on('close', async () => {
            if (!res.finished) { // Se a resposta não terminou quando a conexão fechou, algo deu errado ou foi interrompido
                console.warn(`Conexão fechada prematuramente. Limpando diretório temporário: ${tempDir}`);
                try {
                    // Verifica se o diretório temporário ainda existe antes de tentar removê-lo
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
        // --- Cenário 3: Erro geral no backend (antes de enviar o ZIP) ---
        // Este catch pega erros que ocorrem antes de configurar os cabeçalhos da resposta (ex: erro ao criar temp dir, erro no Promise.all antes de todos resolverem/rejeitarem se não tratado individualmente).
        // Se o erro ocorreu antes de enviar cabeçalhos (res.headersSent é false), podemos enviar status 500 com detalhes.
        // Se o erro ocorreu depois, a resposta já foi iniciada e não podemos mudar o status (o erro foi logado no archiver.on('error') ou outro evento).
        if (!res.headersSent) {
            // *** Resposta 500: Erro interno do servidor ***
            res.status(500).json({
                error: 'Erro interno do servidor ao processar o lote.',
                details: processingError.message,
                // Inclui a lista de falhas parciais que ocorreram até o ponto deste erro geral (se houver)
                failedDownloads: failedDownloads && Array.isArray(failedDownloads) ? failedDownloads.map(f => ({ url: f.url, error: f.error })) : undefined
            });
            console.log('Resposta 500 enviada ao frontend.');
        } else {
            console.error('Erro capturado após cabeçalhos enviados. Não é possível enviar status 500.', processingError);
            // A limpeza ainda é tratada pelos eventos 'finish'/'close' da resposta, se forem disparados.
        }
    }
    // O bloco finally não é usado aqui para limpeza, pois a limpeza é assíncrona
    // e depende do estado da resposta HTTP (enviada, fechada).
});


// --- Inicia o servidor ---
// Certifique-se de que este é o ponto de entrada do seu script Node.js
app.listen(port, () => {
    console.log(`Backend rodando em http://localhost:${port}`);
    console.log('Aguardando requisições de download em lote...');
});