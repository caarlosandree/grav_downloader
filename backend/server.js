// backend/server.js
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Para Node.js < 18. Se usando Node.js >= 18, pode remover e usar o fetch global.
const fs = require('fs-extra'); // Para lidar com sistema de arquivos (criar diretórios recursivamente, limpar)
const path = require('path'); // Para lidar com caminhos de arquivos
const archiver = require('archiver'); // Para zipar arquivos
const os = require('os'); // Para obter o diretório temporário do sistema
const { v4: uuidv4 } = require('uuid'); // Importa a função para gerar UUIDs
// Certifique-se de instalar a dependência uuid: npm install uuid

// Assumindo que convertGsmToMp3 está corretamente importado e utiliza o caminho do FFmpeg do @ffmpeg-installer
const { convertGsmToMp3 } = require('./converter');

const app = express();
const port = 3000; // Porta que o backend vai "ouvir". Ajuste se necessário.

// Middlewares
app.use(cors()); // Permite requisições de outras origens (seu frontend). Configurar origens específicas em produção é mais seguro.
app.use(express.json()); // Permite que o Express leia JSON no corpo das requisições.

// --- Melhoria: Rastreamento de Status de Processos ---
// Objeto para armazenar o status de cada processo de download em lote
// A chave será o processId (UUID), o valor será um objeto com o status e detalhes da tarefa
const downloadProcesses = {}; // Usamos um objeto simples na memória. Para múltiplos servidores, usar um banco de dados ou cache seria necessário.


// --- Rota para iniciar o download em lote (MODIFICADA para processamento assíncrono e retorno de ID) ---
// Esta rota AGORA apenas valida a requisição, inicia o processo em background e retorna o ID.
// O cliente (frontend) deverá usar o ID para consultar o status e baixar o arquivo finalizado.
app.post('/download-batch', async (req, res) => {
    console.log('Requisição de download em lote recebida para iniciar processamento.');
    // O corpo da requisição é a lista de objetos { url: string, datahora: string } enviada pelo frontend
    // Agora também inclui a flag convertToMp3
    const { recordings, convertToMp3 } = req.body; // Extrai a lista de gravações e a flag

    // Validação básica
    if (!recordings || !Array.isArray(recordings) || recordings.length === 0) {
        console.log('Nenhuma gravação fornecida na requisição POST /download-batch.');
        // Retorna status 400 Bad Request com um JSON de erro
        return res.status(400).json({ error: 'Nenhuma gravação fornecida para download.' });
    }

    // 1. Gera um ID único para este processo (usando UUID)
    const processId = uuidv4(); // Gera um UUID versão 4
    console.log(`Iniciando novo processo de download com ID: ${processId}`);

    // 2. Inicializa o status do processo
    downloadProcesses[processId] = {
        processId: processId, // Inclui o ID no próprio objeto de status
        status: 'pending', // Estados: pending, downloading, converting, archiving, completed, failed, cancelled
        total: recordings.length, // Total de gravações na requisição
        downloaded: 0, // Contador de downloads bem-sucedidos
        converted: 0, // Contador de conversões bem-sucedidas (se aplicável)
        failedDownloads: [], // Lista de arquivos que falharam no download
        failedConversions: [], // Lista de arquivos que falharam na conversão
        log: [], // Para armazenar mensagens de log do backend para o frontend
        zipFilePath: null, // Caminho ABSOLUTO para o arquivo ZIP finalizado no servidor
        error: null, // Mensagem de erro em caso de falha fatal do processo
        startTime: new Date().toISOString(), // Tempo de início no formato ISO
        endTime: null, // Tempo de fim no formato ISO
        convertToMp3: convertToMp3 // Inclui a flag de conversão no status
    };

    // 3. Envia o ID do processo de volta para o frontend IMEDIATAMENTE (Status 202 Accepted)
    // Isso libera a conexão HTTP principal rapidamente.
    res.status(202).json({ processId: processId });
    console.log(`Resposta 202 Accepted enviada ao frontend com Process ID: ${processId}`);


    // 4. Inicia o processo de download, conversão e arquivamento de forma assíncrona.
    // Usamos um IIFE (Immediately Invoked Function Expression) assíncrona para executar a lógica
    // sem bloquear a thread principal ou a resposta HTTP anterior.
    (async () => {
        // Obtém a referência para o status do processo que acabamos de criar
        const processStatus = downloadProcesses[processId];

        const baseTempDir = os.tmpdir(); // Diretório temporário base do sistema
        // Cria um subdiretório temporário único para cada processo usando o processId
        const tempDir = path.join(baseTempDir, `grav_downloader_${processId}`);
        // Nome do arquivo ZIP finalizado, usando o processId para garantir unicidade
        const outputZipFilename = `gravacoes_download_${processId}.zip`;
        const outputZipPath = path.join(baseTempDir, outputZipFilename);

        // Adiciona os caminhos temporários ao log/status para rastreamento
        processStatus.log.push(`Diretório temporário do processo: ${tempDir}`);
        processStatus.log.push(`Caminho esperado do arquivo ZIP: ${outputZipPath}`);

        try {
            // Garante que o diretório temporário exista antes de baixar
            await fs.ensureDir(tempDir);
            console.log(`Processo ${processId}: Diretório temporário criado: ${tempDir}`);
            processStatus.log.push(`Diretório temporário criado.`);


            // --- Processo de Download ---
            console.log(`Processo ${processId}: Iniciando download de ${processStatus.total} gravações...`);
            processStatus.status = 'downloading'; // Atualiza status principal
            processStatus.log.push(`Iniciando download de ${processStatus.total} gravações...`);

            const downloadedFiles = []; // Para armazenar informações de arquivos baixados com sucesso
            // 'failedDownloads' já está no objeto processStatus.


            // Usando Promise.all para baixar arquivos concorrentemente (pode adicionar limite depois)
            // NOTA: Para adicionar limite de concorrência, usar uma biblioteca como 'p-limit' ou implementar manualmente
            // Exemplo com p-limit: const pLimit = require('p-limit')(5); // Limita a 5 downloads concorrentes
            await Promise.all(recordings.map(async (recording, index) => {
                // Verifica se o processo foi cancelado ANTES de iniciar o download deste arquivo
                if (downloadProcesses[processId]?.status === 'cancelled') {
                    console.log(`Processo ${processId} cancelado. Pulando download do arquivo ${index}: ${recording.url}`);
                    processStatus.log.push(`Processo cancelado. Download do arquivo ${recording.url} pulado.`);
                    return; // Sai da execução desta Promise para este arquivo
                }

                const fileId = `${processId}_${index}`; // ID interno para o arquivo temporário
                const outputGsmPath = path.join(tempDir, `${fileId}.gsm`); // Caminho temporário do arquivo GSM

                try {
                    console.log(`Processo ${processId}: Baixando ${recording.url} -> ${outputGsmPath}`);
                    const response = await fetch(recording.url);

                    // Verifica se a resposta HTTP é OK
                    if (!response.ok) {
                        const errorText = await response.text().catch(() => 'Sem detalhes no corpo'); // Tenta ler o corpo da resposta de erro
                        throw new Error(`Erro HTTP ${response.status} - ${response.statusText}. Corpo: ${errorText.substring(0, 100)}...`);
                    }

                    // Verifica se a resposta tem conteúdo (para o caso de "Resposta vazia")
                    const buffer = await response.buffer(); // Lê o corpo como Buffer
                    if (!buffer || buffer.length === 0) {
                        throw new Error('Resposta vazia (arquivo não encontrado ou vazio)');
                    }

                    // Escreve o buffer no arquivo local
                    await fs.writeFile(outputGsmPath, buffer);

                    // Adiciona as informações do arquivo baixado com sucesso
                    downloadedFiles.push({
                        originalUrl: recording.url,
                        localPath: outputGsmPath,
                        datahora: recording.datahora,
                        // Incluir outros dados aqui pode ser útil para nomear arquivos no ZIP, etc.
                        src: recording.src, // Assumindo que src/dst/duration vieram no payload do FE
                        dst: recording.dst,
                        duration: recording.duration
                    });

                    console.log(`Processo ${processId}: Download bem-sucedido: ${recording.url}`);
                    processStatus.downloaded++; // Atualiza contador de downloads bem-sucedidos
                    processStatus.log.push(`Download bem-sucedido: ${recording.url}`);


                } catch (error) {
                    console.error(`Processo ${processId}: Falha no download de ${recording.url}:`, error.message);
                    processStatus.failedDownloads.push({ url: recording.url, datahora: recording.datahora, error: error.message });
                    processStatus.log.push(`Falha no download de ${recording.url}: ${error.message}`);
                    // A contagem de downloads bem-sucedidos NÃO é incrementada em caso de falha.
                }
            })); // Fim do Promise.all para downloads


            console.log(`Processo ${processId}: Download concluído. Sucessos: ${processStatus.downloaded}, Falhas: ${processStatus.failedDownloads.length}`);
            processStatus.log.push(`Download concluído. Sucessos: ${processStatus.downloaded}, Falhas: ${processStatus.failedDownloads.length}`);


            // --- Processo de Conversão (se requested) ---
            const filesToArchive = []; // Arquivos que serão incluídos no ZIP (pode ser GSM original ou MP3 convertido)
            // 'failedConversions' já está no objeto processStatus.
            processStatus.converted = 0; // Reseta o contador de conversão para o processo atual

            // Verifica se o processo foi cancelado ANTES de iniciar a conversão
            if (downloadProcesses[processId]?.status === 'cancelled') {
                console.log(`Processo ${processId} cancelado ANTES da conversão.`);
                processStatus.log.push(`Processo cancelado ANTES da conversão.`);
                // A limpeza será tratada no finally.
                // O status já está 'cancelled', não precisa mudar aqui.
            } else if (convertToMp3 && downloadedFiles.length > 0) {
                console.log(`Processo ${processId}: Iniciando conversão para MP3 de ${downloadedFiles.length} arquivos...`);
                processStatus.status = 'converting'; // Atualiza status principal
                processStatus.log.push(`Iniciando conversão para MP3 de ${downloadedFiles.length} arquivos...`);


                // Converte apenas os arquivos baixados com sucesso
                // Usando loop for...of para processar SEQUENCIALMENTE por padrão.
                // Para paralelizar conversão, usar p-limit aqui também.
                for (const fileInfo of downloadedFiles) {
                    // Verifica se o processo foi cancelado antes de iniciar a conversão DESTE ARQUIVO
                    if (downloadProcesses[processId]?.status === 'cancelled') {
                        console.log(`Processo ${processId} cancelado. Pulando conversão do arquivo: ${fileInfo.originalUrl}`);
                        processStatus.log.push(`Processo cancelado. Conversão do arquivo ${fileInfo.originalUrl} pulada.`);
                        break; // Sai do loop de conversão
                    }

                    const outputMp3Path = fileInfo.localPath.replace('.gsm', '.mp3'); // Nome do arquivo MP3
                    try {
                        console.log(`Processo ${processId}: Convertendo ${fileInfo.localPath} -> ${outputMp3Path}`);
                        await convertGsmToMp3(fileInfo.localPath, outputMp3Path);
                        // Adiciona o arquivo MP3 convertido à lista para arquivar
                        // TODO: Melhorar nome do arquivo no ZIP (usar data/hora, src, dst, etc)
                        filesToArchive.push({ path: outputMp3Path, name: `${path.basename(outputMp3Path)}` });
                        console.log(`Processo ${processId}: Conversão bem-sucedida.`);
                        processStatus.converted++; // Atualiza contador de conversões bem-sucedidas
                        processStatus.log.push(`Conversão bem-sucedida para ${fileInfo.originalUrl}`);

                    } catch (error) {
                        console.error(`Processo ${processId}: Falha na conversão de ${fileInfo.localPath}:`, error.message);
                        processStatus.failedConversions.push({ url: fileInfo.originalUrl, datahora: fileInfo.datahora, error: error.message, format: 'gsm_to_mp3' });
                        processStatus.log.push(`Falha na conversão de ${fileInfo.originalUrl}: ${error.message}`);
                        // Se a conversão falhar, tenta adicionar o arquivo GSM original ao ZIP
                        filesToArchive.push({
                            path: fileInfo.localPath,
                            // TODO: Melhorar nome do arquivo GSM no ZIP (usar data/hora, src, dst, etc.)
                            name: `${path.basename(fileInfo.localPath)}`,
                            conversionFailed: true // Marca que a conversão falhou para este arquivo
                        });
                        processStatus.log.push(`Adicionando arquivo original ${path.basename(fileInfo.localPath)} ao ZIP devido à falha na conversão.`);
                    }
                } // Fim do loop de conversão


                console.log(`Processo ${processId}: Conversão concluída. Sucessos: ${processStatus.converted}, Falhas: ${processStatus.failedConversions.length}`);
                processStatus.log.push(`Conversão concluída. Sucessos: ${processStatus.converted}, Falhas: ${processStatus.failedConversions.length}`);


            } else if (!convertToMp3 && downloadedFiles.length > 0) {
                // Se a conversão NÃO foi solicitada e houve downloads, adiciona os arquivos GSM baixados para arquivar
                console.log(`Processo ${processId}: Conversão não solicitada. Adicionando ${downloadedFiles.length} arquivos GSM baixados ao ZIP.`);
                processStatus.log.push('Conversão não solicitada. Adicionando arquivos GSM baixados ao ZIP.');

                downloadedFiles.forEach(fileInfo => {
                    // TODO: Melhorar nome do arquivo GSM no ZIP (usar data/hora, src, dst, etc.)
                    filesToArchive.push({ path: fileInfo.localPath, name: `${path.basename(fileInfo.localPath)}` });
                });
            } else {
                // Caso não haja arquivos baixados para processar (todos falharam no download)
                console.warn(`Processo ${processId}: Nenhum arquivo baixado com sucesso para converter/arquivar.`);
                processStatus.log.push('Nenhum arquivo baixado com sucesso para converter/arquivar.');
            }

            // Verifica se o processo foi cancelado após download/conversão mas antes do arquivamento
            if (downloadProcesses[processId]?.status === 'cancelled') {
                console.log(`Processo ${processId} cancelado ANTES do arquivamento.`);
                processStatus.log.push(`Processo cancelado ANTES do arquivamento.`);
                // A limpeza será tratada no finally.
                // O status já está 'cancelled', não precisa mudar aqui.
                // Sai da execução atual para garantir que o arquivamento não ocorra.
                return; // Importante sair aqui!
            }


            // --- Processo de Arquivamento (Criação do ZIP) ---
            // Cria o stream de saída para o arquivo ZIP final
            const output = fs.createWriteStream(outputZipPath);
            const archive = archiver('zip', { zlib: { level: 9 } }); // Nível de compressão máxima

            // Configura os eventos do arquivador e do stream de saída
            archive.on('warning', (err) => {
                console.warn(`Processo ${processId}: Aviso durante arquivamento:`, err.message);
                processStatus.log.push(`Aviso durante arquivamento: ${err.message}`);
            });

            archive.on('error', (err) => {
                console.error(`Processo ${processId}: Erro durante arquivamento:`, err);
                // Marca o processo como falho e armazena o erro
                processStatus.error = `Erro fatal durante arquivamento: ${err.message}`;
                processStatus.status = 'failed';
                processStatus.endTime = new Date().toISOString();
                processStatus.log.push(processStatus.error);
                // Aborta o arquivamento e fecha o stream de saída para tentar liberar recursos
                archive.abort();
                output.close(); // Dispara 'close' para permitir limpeza no finally
            });

            // Quando o stream de saída (output) terminar de escrever o arquivo ZIP no disco
            output.on('close', async () => {
                console.log(`Processo ${processId}: Arquivo ZIP criado com sucesso: ${outputZipPath} (${archive.pointer()} bytes)`);
                processStatus.log.push(`Arquivo ZIP criado: ${outputZipPath} (${archive.pointer()} bytes)`);

                // --- Criação do Relatório de Processamento ---
                console.log(`Processo ${processId}: Criando relatório de processamento...`);
                let reportContent = `Relatório de Processamento do Lote de Gravações (Processo: ${processId}):\n`;
                reportContent += `Início: ${processStatus.startTime}\n`; // Usa ISO string
                reportContent += `Fim: ${new Date().toISOString()}\n`; // Tempo de fim do relatório
                reportContent += `Status Final: ${processStatus.status}\n`;
                reportContent += `Total de gravações na requisição: ${processStatus.total}\n`;
                reportContent += `Arquivos baixados com sucesso: ${processStatus.downloaded}\n`;
                if (processStatus.convertToMp3) {
                    reportContent += `Arquivos convertidos para MP3: ${processStatus.converted}\n`;
                    reportContent += `Conversões falhas: ${processStatus.failedConversions.length}\n`;
                }
                reportContent += `Downloads falhos: ${processStatus.failedDownloads.length}\n`;
                reportContent += `Arquivos incluídos no ZIP: ${filesToArchive.length} (Nota: Inclui GSMs originais onde a conversão falhou)\n`;


                if (processStatus.failedDownloads.length > 0) {
                    reportContent += `\n--- Detalhes dos Downloads Falhos (${processStatus.failedDownloads.length}) ---\n`;
                    processStatus.failedDownloads.forEach(f => {
                        reportContent += `URL: ${f.url}\n`;
                        reportContent += `Data/Hora: ${f.datahora || 'N/A'}\n`;
                        reportContent += `Erro: ${f.error}\n---\n`;
                    });
                }

                if (processStatus.failedConversions.length > 0) {
                    reportContent += `\n--- Detalhes das Conversões Falhas (${processStatus.failedConversions.length}) ---\n`;
                    processStatus.failedConversions.forEach(f => {
                        reportContent += `URL Original: ${f.url}\n`;
                        reportContent += `Data/Hora: ${f.datahora || 'N/A'}\n`;
                        reportContent += `Formato: ${f.format}\n`;
                        reportContent += `Erro: ${f.error}\n---\n`;
                    });
                }

                // Inclui logs gerais do processo
                reportContent += `\n--- Logs Gerais do Processo ---\n`;
                // Adiciona os logs acumulados no objeto de status
                processStatus.log.forEach(logEntry => {
                    reportContent += `${logEntry}\n`;
                });


                const reportFileName = `processamento_relatorio_${processId}.log`;
                // Salva relatório NO DIRETÓRIO TEMPORÁRIO DO PROCESSO
                const reportFilePath = path.join(tempDir, reportFileName);
                console.log(`Processo ${processId}: Salvando relatório em ${reportFilePath}`);

                try {
                    await fs.writeFile(reportFilePath, reportContent);
                    console.log(`Processo ${processId}: Relatório salvo.`);
                    // Adiciona o relatório ao arquivo ZIP antes de finalizar
                    archive.file(reportFilePath, { name: reportFileName });
                    console.log(`Processo ${processId}: Relatório adicionado ao ZIP.`);

                    // NOTA: O .finalize() já foi chamado logo após o pipe(output) no fluxo principal.
                    // Se chamarmos finalize() aqui novamente, pode causar problemas.
                    // O evento 'close' do output ocorre DEPOIS que finalize() foi chamado e o ZIP foi escrito.
                    // Portanto, adicionar o relatório AQUI e chamar finalize() NOVAMENTE está incorreto.
                    // Precisamos adicionar o relatório AO ARQUIVO ZIP *antes* de chamar archive.finalize().
                    // ISSO EXIGE REESTRUTURAR COMO O ARQUIVAMENTO É TRATADO.

                    // Corrigindo a lógica:
                    // 1. Crie o relatório ANTES de chamar archive.finalize().
                    // 2. Adicione o relatório ao archive.
                    // 3. Chame archive.finalize().

                    // A lógica de arquivamento precisa ser revista para incluir o relatório de forma confiável.
                    // Por enquanto, a criação do relatório neste ponto (após o close do output) está fora de ordem para ser adicionado ao ZIP.

                    // Vamos ajustar para que o relatório seja criado e adicionado ANTES de finalizar o arquivo.


                } catch (reportWriteError) {
                    console.error(`Processo ${processId}: Erro ao salvar ou adicionar relatório ao ZIP:`, reportWriteError);
                    processStatus.log.push(`Erro ao salvar/adicionar relatório ao ZIP: ${reportWriteError.message}`);
                    // Continua, mas sem o relatório no ZIP final
                }

                // O status e o zipFilePath são definidos DEPOIS que o output.on('close') COMPLETAR
                if (processStatus.status !== 'failed') { // Só marca como completo se não falhou fatalmente antes
                    processStatus.status = 'completed';
                    processStatus.zipFilePath = outputZipPath; // Armazena o caminho ABSOLUTO do ZIP no status
                    processStatus.endTime = new Date().toISOString();
                    console.log(`Processo ${processId} FINALMENTE concluído e ZIP pronto.`);
                    processStatus.log.push(`Processo ${processId} concluído. ZIP pronto para download.`);
                } else {
                    // Se chegou aqui com status 'failed', o erro já foi registrado.
                    console.log(`Processo ${processId} finalizou com status de falha.`);
                }


            }); // Fim de output.on('close')


            // Conecta o stream de arquivamento ao stream de saída do arquivo
            archive.pipe(output);

            // Adiciona os arquivos de gravação (GSM ou MP3) ao arquivo ZIP
            if (filesToArchive.length > 0) {
                console.log(`Processo ${processId}: Adicionando ${filesToArchive.length} arquivos de gravação ao ZIP...`);
                filesToArchive.forEach(file => {
                    // Use o nome definido no objeto file.name
                    archive.file(file.path, { name: file.name });
                    console.log(`Processo ${processId}: Adicionado ${file.name} ao ZIP.`);
                });
                console.log(`Processo ${processId}: Arquivos de gravação adicionados ao ZIP.`);
            } else {
                console.warn(`Processo ${processId}: Nenhum arquivo de gravação para adicionar ao ZIP.`);
                processStatus.log.push('Nenhum arquivo de gravação para adicionar ao ZIP.');
            }

            // --- ADICIONANDO O RELATÓRIO ANTES DE FINALIZAR ---
            // Precisamos gerar o conteúdo do relatório AQUI (antes de finalizar o arquivamento)
            let reportContentPreFinalize = `Relatório Parcial de Processamento do Lote de Gravações (Processo: ${processId}):\n`;
            reportContentPreFinalize += `Início: ${processStatus.startTime}\n`;
            reportContentPreFinalize += `Status Atual: ${processStatus.status}\n`; // Status no momento do arquivamento
            reportContentPreFinalize += `Total de gravações na requisição: ${processStatus.total}\n`;
            reportContentPreFinalize += `Arquivos baixados com sucesso: ${processStatus.downloaded}\n`;
            if (processStatus.convertToMp3) {
                reportContentPreFinalize += `Arquivos convertidos para MP3: ${processStatus.converted}\n`;
                reportContentPreFinalize += `Conversões falhas: ${processStatus.failedConversions.length}\n`;
            }
            reportContentPreFinalize += `Downloads falhos: ${processStatus.failedDownloads.length}\n`;
            reportContentPreFinalize += `Arquivos de gravação prontos para incluir no ZIP: ${filesToArchive.length}\n`;

            if (processStatus.failedDownloads.length > 0) {
                reportContentPreFinalize += `\n--- Detalhes dos Downloads Falhos (${processStatus.failedDownloads.length}) ---\n`;
                processStatus.failedDownloads.forEach(f => {
                    reportContentPreFinalize += `URL: ${f.url}\n`;
                    reportContentPreFinalize += `Data/Hora: ${f.datahora || 'N/A'}\n`;
                    reportContentPreFinalize += `Erro: ${f.error}\n---\n`;
                });
            }

            if (processStatus.failedConversions.length > 0) {
                reportContentPreFinalize += `\n--- Detalhes das Conversões Falhas (${processStatus.failedConversions.length}) ---\n`;
                processStatus.failedConversions.forEach(f => {
                    reportContentPreFinalize += `URL Original: ${f.url}\n`;
                    reportContentPreFinalize += `Data/Hora: ${f.datahora || 'N/A'}\n`;
                    reportContentPreFinalize += `Formato: ${f.format}\n`;
                    reportContentPreFinalize += `Erro: ${f.error}\n---\n`;
                });
            }

            reportContentPreFinalize += `\n--- Logs Gerais do Processo ---\n`;
            processStatus.log.forEach(logEntry => {
                reportContentPreFinalize += `${logEntry}\n`;
            });

            const reportFileNamePre = `processamento_relatorio_${processId}.log`;
            // Adiciona o relatório ao ZIP como uma string (não precisa salvar em arquivo temporário só para isso)
            archive.append(reportContentPreFinalize, { name: reportFileNamePre });
            console.log(`Processo ${processId}: Relatório inicial adicionado ao ZIP.`);


            // --- Finaliza o Arquivamento ---
            // Chame finalize APENAS DEPOIS de adicionar TODOS os arquivos (gravações + relatório)
            console.log(`Processo ${processId}: Finalizando arquivo ZIP...`);
            archive.finalize(); // Finaliza o arquivo ZIP. Isso dispara o evento 'close' no stream de saída.
            console.log(`Processo ${processId}: Finalize() chamado.`);


            // Se não há arquivos para arquivar (gravações ou relatório), o evento 'close' no output pode não disparar
            // em alguns casos. Mas com o relatório sendo adicionado, deve sempre haver algo.
            // Se, por algum motivo extremo, finalize() for chamado e o output.on('close') não for disparado,
            // o status do processo pode nunca ser marcado como 'completed'. Isso é um edge case.


        } catch (processingError) {
            // Este catch lida com erros que ocorrem ANTES ou DURANTE o arquivamento (exceto erros do stream do arquivo, que são tratados no archive.on('error'))
            console.error(`Processo ${processId}: Erro fatal no processamento (antes/durante arquivamento):`, processingError);
            // Certifica-se de que o status seja 'failed'
            if (processStatus.status !== 'failed') {
                processStatus.status = 'failed';
                processStatus.error = `Erro fatal: ${processingError.message}`;
                processStatus.endTime = new Date().toISOString();
                processStatus.log.push(processStatus.error);
                // Tenta limpar os streams em caso de erro fatal antecipado
                archive.abort(); // Garante que o arquivamento pare
                output.close(); // Fecha o stream de saída para tentar liberar recursos
            }

            // Não tenta criar um ZIP de erro separado aqui, pois a lógica de erro do arquivador já tenta marcar como falho.
            // O relatório de erro é gerado na falha do arquivador.
        } finally {
            // A limpeza do diretório temporário (`tempDir`) será feita APENAS pelo frontend
            // ou por uma tarefa de limpeza separada (em um sistema de produção).
            // Manter o diretório temporário permite inspecionar os arquivos se o processo falhar antes do ZIP.
            // O arquivo ZIP finalizado (`outputZipPath`) será limpo APÓS o download pelo cliente.
            console.log(`Processo ${processId}: Final da execução assíncrona do processamento.`);
            // O status e endTime já devem ter sido definidos em 'completed', 'failed', ou 'cancelled'.
        }
    })(); // Fim do IIFE assíncrono


}); // Fim da rota POST /download-batch


// --- Nova Rota para obter o Status de um Processo ---
// O frontend consultará esta rota periodicamente (polling)
app.get('/status/:processId', (req, res) => {
    const processId = req.params.processId;
    const status = downloadProcesses[processId];

    if (status) {
        // Retorna o status atual do processo
        res.json(status);
        console.log(`Status do processo ${processId} solicitado. Status atual: ${status.status}, Baixados: ${status.downloaded}/${status.total}, Convertidos: ${status.converted}/${status.downloaded - status.failedConversions.length}`);
    } else {
        // Se o processId não for encontrado, pode ser que já foi limpo ou nunca existiu
        console.warn(`Status do processo ${processId} solicitado, mas não encontrado.`);
        res.status(404).json({ error: 'Processo não encontrado ou já finalizado/limpo.' });
    }
});


// --- Nova Rota para baixar o Arquivo ZIP finalizado ---
// O frontend chamará esta rota APENAS quando o status for 'completed'
app.get('/download/:processId', async (req, res) => {
    const processId = req.params.processId;
    const processStatus = downloadProcesses[processId];

    // Verifica se o processo existe e está completo com um caminho de arquivo ZIP válido
    if (!processStatus || processStatus.status !== 'completed' || !processStatus.zipFilePath) {
        console.log(`Requisição de download para processo ${processId} falhou. Status: ${processStatus?.status || 'inexistente'}, zipFilePath: ${processStatus?.zipFilePath || 'não definido'}`);
        return res.status(404).json({ error: 'Arquivo de download não pronto ou não encontrado.' });
    }

    const zipFilePath = processStatus.zipFilePath;

    try {
        // Verifica se o arquivo ZIP realmente existe no sistema de arquivos
        const fileExists = await fs.exists(zipFilePath);
        if (!fileExists) {
            console.error(`Processo ${processId}: Arquivo ZIP não encontrado no caminho esperado: ${zipFilePath}`);
            // Limpa o status do processo, pois o arquivo esperado não está lá
            // Isso ajuda a evitar futuras tentativas de download para um arquivo que não existe
            delete downloadProcesses[processId];
            return res.status(404).json({ error: 'Arquivo de download não encontrado no servidor.' });
        }

        // Define os cabeçalhos para forçar o download no navegador
        const filename = `gravações_lote_${processId}.zip`; // Define um nome de arquivo padrão para o download
        // Você pode tentar usar o nome original do arquivo ZIP se preferir: path.basename(zipFilePath)
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.setHeader('Content-Type', 'application/zip');

        // Cria um stream de leitura do arquivo ZIP e o direciona diretamente para a resposta HTTP
        const fileStream = fs.createReadStream(zipFilePath);
        fileStream.pipe(res); // Direciona o stream do arquivo para o stream de resposta HTTP

        // --- Limpeza APÓS o arquivo ter sido completamente enviado ao cliente ---
        // Este evento é disparado quando o stream de leitura do arquivo termina.
        fileStream.on('close', async () => {
            console.log(`Processo ${processId}: Arquivo ZIP ${zipFilePath} enviado para o cliente. Iniciando limpeza de arquivos temporários...`);
            try {
                // Limpa o arquivo ZIP que acabou de ser baixado
                await fs.remove(zipFilePath);
                console.log(`Processo ${processId}: Arquivo ZIP temporário limpo: ${zipFilePath}`);

                // Limpa o diretório temporário associado a este processo
                const tempDirAssociated = path.join(os.tmpdir(), `grav_downloader_${processId}`);
                const tempDirExists = await fs.exists(tempDirAssociated);
                if (tempDirExists) {
                    await fs.remove(tempDirAssociated);
                    console.log(`Processo ${processId}: Diretório temporário limpo: ${tempDirAssociated}`);
                }

                // Limpa o status do processo da lista de processos ativos
                delete downloadProcesses[processId];
                console.log(`Processo ${processId} e todos os arquivos temporários associados limpos.`);

            } catch (cleanError) {
                console.error(`Processo ${processId}: Erro durante a limpeza pós-download:`, cleanError);
                // O processo e o arquivo ZIP podem ficar no disco neste caso, precisando de limpeza manual.
                // O status do processo AINDA pode existir na memória se a limpeza falhar depois do delete.
            }
        });

        // Lida com erros durante a leitura ou envio do stream do arquivo
        fileStream.on('error', (err) => {
            console.error(`Processo ${processId}: Erro ao ler/enviar stream do arquivo ZIP ${zipFilePath}:`, err);
            // Se os cabeçalhos ainda não foram enviados, podemos enviar uma resposta de erro
            if (!res.headersSent) {
                res.status(500).json({ error: 'Erro ao enviar arquivo para download.' });
            } else {
                // Se os cabeçalhos JÁ foram enviados, a única opção é tentar parar a resposta.
                // Isso pode resultar em um download incompleto para o cliente.
                // A limpeza no 'close' ou 'error' (se aplicável) ainda deve tentar ocorrer.
                res.end(); // Fecha a conexão de resposta abruptamente
            }
            // A limpeza no fileStream.on('close') ainda deve ser acionada se o stream fechar,
            // ou você pode precisar de lógica de limpeza adicional aqui em caso de erro.
        });


    } catch (error) {
        // Captura erros gerais antes de iniciar o stream de leitura
        console.error(`Processo ${processId}: Erro fatal ao preparar download do arquivo ZIP:`, error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erro interno do servidor ao preparar o download.' });
        }
        // Nenhuma limpeza automática aqui, pode ser necessária lógica adicional dependendo do erro.
    }
});


// --- Nova Rota para Cancelar um Processo (Opcional mas recomendado com indicador) ---
// O frontend chamará esta rota se o usuário clicar em cancelar
app.post('/cancel/:processId', (req, res) => {
    const processId = req.params.processId;
    const processStatus = downloadProcesses[processId];

    if (processStatus && processStatus.status !== 'completed' && processStatus.status !== 'failed' && processStatus.status !== 'cancelled') {
        // Marca o processo como cancelado
        processStatus.status = 'cancelled';
        processStatus.endTime = new Date().toISOString();
        processStatus.log.push('Processamento cancelado pelo usuário.');
        console.log(`Processo ${processId} marcado para cancelamento.`);
        // O loop de processamento assíncrono verificará este status e abortará.
        res.json({ success: true, message: `Processo ${processId} marcado para cancelamento.` });
    } else if (processStatus && processStatus.status === 'cancelled') {
        // Já estava cancelado
        res.json({ success: true, message: `Processo ${processId} já estava cancelado.` });
    } else if (processStatus) {
        // Processo já completo ou falho
        res.status(400).json({ error: `Processo ${processId} já está em estado final (${processStatus.status}).` });
    }
    else {
        // Processo não encontrado
        res.status(404).json({ error: 'Processo não encontrado.' });
    }
});


// --- Inicia o servidor ---
app.listen(port, () => {
    console.log(`Backend rodando em http://localhost:${port}`);
    console.log('Aguardando requisições...');
    console.log('Certifique-se de que o FFmpeg está instalado e acessível se a conversão for solicitada.');
    console.log('UUID library imported. Ensure it is installed: npm install uuid'); // Lembrete
});