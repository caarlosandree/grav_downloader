// backend/routes/downloadBatch.js
const express = require('express');
const router = express.Router(); // Usamos Router para definir sub-rotas
const fetch = require('node-fetch'); // Para Node.js < 18
const fs = require('fs-extra'); // Para manipulação de arquivos e diretórios (inclui ensureDir, remove)
const path = require('path');
const archiver = require('archiver'); // Para criar arquivos ZIP
const os = require('os'); // Para obter o diretório temporário do sistema
const { v4: uuidv4 } = require('uuid'); // Para gerar IDs únicos

// Importa a função de conversão
const { convertGsmToMp3 } = require('../converter');

// Função auxiliar para determinar o nome do arquivo dentro do ZIP, INCLUINDO PASTAS POR DATA
// Baseado nos dados da gravação (origem, destino, datahora, ramal, nomeoperador)
function determineZipFilePath(recording, extension) { // Renomeada para ZipFilePath e aceita extensão
    // Garante que datahora existe antes de tentar processar
    if (!recording.datahora) {
        console.warn(`Gravação sem datahora. Usando data e hora atual para nome do arquivo.`);
        const now = new Date();
        recording.datahora = now.toISOString().replace('T', ' ').substring(0, 19); // Formato YYYY-MM-DD HH:mm:ss
    }

    const date = new Date(recording.datahora.replace(' ', 'T')); // Cria objeto Date
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    const origem = recording.src || 'N/A';
    const destino = recording.dst || 'N/A';
    const ramal = recording.ramal || 'N/A';
    const nomeOperador = recording.nomeoperador || 'N/A';


    // Remove caracteres inválidos para nome de arquivo e pasta
    const cleanOrigem = origem.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 20); // Limita o tamanho
    const cleanDestino = destino.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 20); // Limita o tamanho
    const cleanRamal = ramal.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 10); // Limita o tamanho
    // Limita o nome do operador para evitar nomes de arquivo muito longos
    const cleanNomeOperador = nomeOperador.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 20);


    // Formato do nome do arquivo: DataHora_Ramal_NomeOperador_Origem_Destino
    const filename = `${year}${month}${day}_${hours}${minutes}${seconds}_R${cleanRamal}_OP${cleanNomeOperador}_De${cleanOrigem}_Para${cleanDestino}.${extension}`;

    // Formato da pasta: YYYY/MM/DD
    const folderPath = path.join(year, month, day); // Cria o caminho da pasta

    // Retorna o caminho COMPLETO dentro do ZIP (pasta + nome do arquivo)
    return path.join(folderPath, filename); // Ex: 2025/05/16/20250516_183045_R123_OPfulano_De456_Para789.mp3
}


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
        // Se a lista está vazia, tratamos como 400 Bad Request
        return res.status(400).json({ error: 'Nenhuma lista de gravações válida fornecida no corpo da requisição.' });
    }

    // Adicionado validação mais rigorosa para garantir que cada item tem url_gravacao válida
    const hasInvalidItems = recordings.some(rec => !rec.url_gravacao || typeof rec.url_gravacao !== 'string' || rec.url_gravacao === '#');
    if (hasInvalidItems) {
        console.warn(`Requisição recebida com itens sem url_gravacao válida. Quantidade total: ${recordings.length}.`);
        // Ainda retornamos 400 se a lista contiver itens inválidos
        return res.status(400).json({ error: `Alguns itens na lista de gravações (${recordings.length}) não possuem 'url_gravacao' válida.` });
    }


    console.log(`Recebidas ${recordings.length} gravações para processar.`);

    // Cria um diretório temporário único para este lote
    const tempDir = path.join(os.tmpdir(), `widevoice_batch_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    console.log(`Criando diretório temporário: ${tempDir}`);

    const failedDownloads = []; // Para rastrear downloads que falharam
    const failedConversions = []; // Para rastrear conversões que falharam
    const processedFiles = []; // Armazena informações sobre arquivos processados com sucesso para arquivamento

    // Cria o diretório temporário. Use fs.ensureDir para garantir que ele exista.
    try {
        await fs.ensureDir(tempDir);
        console.log(`Diretório temporário ${tempDir} garantido.`);
    } catch (dirError) {
        console.error('Erro ao criar diretório temporário:', dirError);
        if (!res.headersSent) {
            // Se os cabeçalhos não foram enviados, podemos enviar um 500
            return res.status(500).json({ error: 'Erro interno do servidor ao criar diretório temporário.', details: dirError.message });
        } else {
            // Se os cabeçalhos já foram enviados, não podemos enviar um 500 JSON.
            // A conexão será provavelmente abortada.
            console.error('Erro ao criar diretório temporário após headers enviados.', dirError);
            // O erro Archiver ou stream pode ser o próximo a ser capturado e logado.
        }
        // Se não puder enviar status, apenas loga e tenta sair (o finally não será chamado aqui)
        return; // Sai da função
    }


    // --- Processamento Paralelo de Downloads e Conversões ---
    // Usamos Promise.all para processar downloads/conversões em paralelo (mais rápido)
    // O await Promise.all aguarda que TODAS as Promises internas sejam resolvidas ou rejeitadas.
    await Promise.all(recordings.map(async (recording, index) => {
        const recordingUrl = recording.url_gravacao; // A URL da gravação que o frontend enviou

        // Validação individual da URL (redudante, mas para segurança adicional)
        if (!recordingUrl || typeof recordingUrl !== 'string' || recordingUrl === '#') {
            // Este caso já deveria ter sido pego na validação inicial do array completo
            console.error(`[${index + 1}/${recordings.length}] URL inválida encontrada no item durante o processamento paralelo: ${recordingUrl}. Pulando.`);
            failedDownloads.push({ url: recordingUrl || 'N/A', error: "'url_gravacao' inválida durante o processamento" });
            return; // Pula este item no processamento paralelo
        }

        // Determina o caminho temporário para o arquivo baixado original (.gsm)
        // Usa um nome único (uuid) + parte do nome da URL para evitar colisões no diretório temporário
        const urlBaseName = path.basename(recordingUrl).split('?')[0].split('#')[0]; // Pega o nome do arquivo da URL sem query/hash
        const uniqueFileName = `${uuidv4()}_${urlBaseName}`; // Nome único no diretório temporário
        const originalFilePath = path.join(tempDir, uniqueFileName);

        let finalFilePath = originalFilePath; // Caminho após download, antes de potencial conversão
        let finalFileExtension = 'gsm'; // Extensão final do arquivo (gsm ou mp3)


        // --- Download ---
        try {
            console.log(`[${index + 1}/${recordings.length}] Processando ${path.basename(recordingUrl)}...`);
            console.log(`[${index + 1}/${recordings.length}] Baixando ${recordingUrl}...`);
            const response = await fetch(recordingUrl);

            if (!response.ok) {
                throw new Error(`HTTP status ${response.status}`);
            }

            // Salva o arquivo no diretório temporário
            const fileStream = fs.createWriteStream(originalFilePath);
            await new Promise((resolve, reject) => {
                response.body.pipe(fileStream);
                response.body.on('error', reject);
                fileStream.on('finish', resolve); // Resolve quando o stream de escrita termina
                fileStream.on('error', reject); // Rejeita se houver erro no stream de escrita
            });
            console.log(`[${index + 1}/${recordings.length}] Download concluído: ${originalFilePath}`);

            // --- Conversão Opcional para MP3 ---
            if (convertToMp3) {
                const mp3FileName = path.basename(originalFilePath).replace(/\.gsm$/i, '.mp3'); // Nome do arquivo MP3 no tempDir
                const mp3FilePath = path.join(tempDir, mp3FileName); // Caminho completo para o arquivo MP3 temporário

                try {
                    console.log(`[${index + 1}/${recordings.length}] Convertendo ${path.basename(originalFilePath)} para MP3...`);
                    // Chama a função de conversão. Ela retorna o caminho do arquivo MP3 gerado.
                    finalFilePath = await convertGsmToMp3(originalFilePath, mp3FilePath);
                    console.log(`[${index + 1}/${recordings.length}] Conversão concluída: ${path.basename(finalFilePath)}`);
                    finalFileExtension = 'mp3'; // Atualiza a extensão final

                    // *** REMOVIDO: Limpeza do arquivo GSM original AQUI. NÃO DEVE SER FEITA AINDA. ***
                    // O arquivo GSM original (originalFilePath) não deve ser removido aqui.
                    // Ele será removido quando o diretório temporário inteiro for limpo no final.

                } catch (convertError) {
                    console.error(`[${index + 1}/${recordings.length}] Erro na conversão para MP3 de ${path.basename(originalFilePath)}:`, convertError);
                    failedConversions.push({ url: recordingUrl, error: convertError.message, format: 'mp3' });
                    // Em caso de erro na conversão, decidimos pular este item.
                    // Não adicionamos nada à lista processedFiles.
                    // O arquivo GSM original (se baixado) será limpo no final com o tempDir.
                    return; // Pula este item no processamento paralelo se a conversão falhou
                }
            } // Fim do if convertToMp3


            // Se download bem-sucedido (e conversão opcional bem-sucedida ou não solicitada)
            // Adiciona informações sobre o arquivo processado à lista para arquivamento.
            // Chama determineZipFilePath para obter o caminho (com pastas) e nome no ZIP.
            const zipEntryPath = determineZipFilePath(recording, finalFileExtension);

            processedFiles.push({ localPath: finalFilePath, zipPath: zipEntryPath });
            console.log(`[${index + 1}/${recordings.length}] Processado e pronto para arquivar: ${finalFilePath} como ${zipEntryPath}`);


        } catch (downloadError) {
            console.error(`[${index + 1}/${recordings.length}] Erro no download de ${recordingUrl}:`, downloadError.message);
            failedDownloads.push({ url: recordingUrl, error: downloadError.message });
            // Continua processando os outros arquivos mesmo se um falhar no download.
            // O arquivo temporário original (originalFilePath) pode ter sido criado parcial ou totalmente.
            // Ele será limpo quando o diretório temporário inteiro for limpo no final.
        } finally {
            // *** REMOVIDO: Limpeza de arquivos temporários INDIVIDUAIS AQUI. NÃO DEVE SER FEITA. ***
            // Qualquer fs.remove(originalFilePath) ou fs.remove(finalFilePath) AQUI é a causa do ENOENT.
            // A limpeza individual não deve acontecer aqui ou logo após o loop map.
            // A limpeza do diretório temporário inteiro no final é suficiente.
        }
    })); // Fim do await Promise.all map


    // --- Lógica de Arquivamento (Criação do ZIP) ---
    // Esta parte é executada APÓS todas as Promises em Promise.all terem sido resolvidas ou rejeitadas.
    // Neste ponto, todos os arquivos que puderam ser processados com sucesso estão no tempDir
    // e suas informações (caminho local e caminho no ZIP) estão em processedFiles.
    console.log('Todos os downloads/conversões paralelos concluídos.');
    console.log(`Arquivando ${processedFiles.length} arquivos...`);

    // Se não houve arquivos processados com sucesso (todos falharam), trate como erro ou aviso
    if (processedFiles.length === 0) {
        console.warn('Nenhum arquivo processado com sucesso para arquivar.');
        // Limpa o diretório temporário imediatamente, pois não há nada para arquivar
        try {
            const exists = await fs.pathExists(tempDir);
            if(exists) {
                await fs.remove(tempDir);
                console.log(`Diretório temporário ${tempDir} limpo, pois nenhum arquivo foi processado.`);
            }
        } catch (cleanError) {
            console.error(`Erro ao limpar diretório temporário ${tempDir} quando nenhum arquivo foi processado:`, cleanError);
        }

        // Envia uma resposta adequada para o frontend (pode ser 500 ou 400 dependendo da causa)
        if (!res.headersSent) {
            // Se houve falhas, envie uma resposta de erro detalhada 500
            if (failedDownloads.length > 0 || failedConversions.length > 0) {
                return res.status(500).json({
                    error: 'Nenhum arquivo processado com sucesso para arquivar, mas houve falhas.',
                    details: 'Todos os downloads ou conversões falharam.',
                    failedDownloads: failedDownloads.map(f => ({ url: f.url, error: f.error })),
                    failedConversions: failedConversions.map(f => ({ url: f.url, error: f.error, format: f.format }))
                });
            } else {
                // Se não houve falhas (lista de entrada estava vazia ou todos pularam por url inválida inicial), envie 400
                return res.status(400).json({ error: 'Nenhum arquivo processado com sucesso para arquivar.', details: 'A lista de gravações estava vazia ou todos os itens tinham URLs inválidas.' });
            }

        } else {
            console.error('Nenhum arquivo processado com sucesso, mas cabeçalhos já enviados. Não é possível enviar status.');
            // Se os cabeçalhos já foram enviados, não podemos fazer nada além de logar
        }
        return; // Sai da função
    }


    // Define o nome do arquivo ZIP final
    const zipFileName = `gravacoes_${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    // Cria um novo arquivador ZIP
    const archive = archiver('zip', {
        zlib: { level: 9 } // Nível de compressão (opcional)
    });

    // Pipe os arquivos arquivados para o stream de resposta HTTP
    archive.pipe(res);

    // --- Tratamento de Erros durante o Arquivamento ou Stream ---
    archive.on('error', (err) => {
        console.error('Archiver error:', err);
        // Este erro ocorre se houver problema ao adicionar/ler um arquivo (ENOENT),
        // ou se o stream de resposta tiver um problema.
        // A limpeza do diretório temporário no 'close' event do *response stream* ainda deve ocorrer.
        // Se os cabeçalhos não foram enviados, não podemos enviar JSON de erro, mas podemos fechar a resposta.
        if (!res.headersSent) {
            // Já enviamos Content-Type application/zip, então não podemos enviar JSON de erro.
            // Fecha a conexão para sinalizar erro. O frontend pode detectar um download incompleto.
            res.status(500).end(); // Envia status 500 e encerra a resposta
            console.log('Resposta 500 enviada ao frontend devido a erro no arquivamento.');
        } else {
            console.error('Erro no arquivamento após cabeçalhos enviados. Conexão pode ser abortada.', err);
            // Se já estava streamando, apenas loga e tenta finalizar o stream
            if (!res.finished) {
                res.end(); // Tenta finalizar a resposta pendente
            }
        }
        // A limpeza do diretório temporário é tratada no 'close' event.
    });

    // --- Tratamento de Conexão Fechada Prematuramente pelo Cliente ---
    res.on('close', async () => {
        console.log('Conexão com o cliente fechada prematuramente.');
        // Limpeza do diretório temporário aqui, SEGUIDO pelo fim do stream (se não finalizado)
        // Se a conexão fechar, garantimos que o diretório temporário seja limpo.
        console.log(`Cliente desconectado. Limpando diretório temporário: ${tempDir}`);
        try {
            const exists = await fs.pathExists(tempDir); // Verifica se o diretório ainda existe
            if(exists) {
                await fs.remove(tempDir);
                console.log(`Diretório temporário ${tempDir} limpo após conexão ser fechada.`);
            }
        } catch (cleanError) {
            console.error(`Erro ao limpar diretório temporário ${tempDir} após fechamento da conexão:`, cleanError);
        }
        // Não precisamos chamar res.end() ou archive.finalize() aqui, pois a conexão já está fechada.
        // Mas é crucial garantir a limpeza.
    });


    // --- Adiciona os arquivos processados ao arquivo ZIP ---
    processedFiles.forEach(file => {
        // Usa fs.createReadStream para adicionar arquivos ao archive de forma eficiente
        // O archiver lida com a leitura do arquivo a partir do caminho local (file.localPath)
        // e o adiciona ao stream ZIP com o nome especificado (file.zipPath), que agora inclui pastas.
        // console.log(`Adicionando ao ZIP: ${file.localPath} como ${file.zipPath}`); // Log de depuração
        try {
            // Verifica se o arquivo ainda existe antes de tentar adicioná-lo (segurança extra)
            // O erro ENOENT que você viu significa que ele NÃO EXISTIA neste ponto.
            // A CAUSA RAIZ é a limpeza prematura, esta verificação é apenas um sintoma/confirmação.
            if (fs.existsSync(file.localPath)) { // Use fs.existsSync para verificação síncrona rápida
                // Adiciona o arquivo ao arquivador. file.zipPath AGORA INCLUI AS PASTAS.
                archive.file(file.localPath, { name: file.zipPath });
            } else {
                console.error(`Arquivo não encontrado ao tentar adicionar ao ZIP: ${file.localPath}. Foi limpo prematuramente?`);
                // Poderíamos adicionar este item à lista de falhas de arquivamento se quiséssemos relatar isso no log.
                // failedArchiving.push({ path: file.localPath, zipPath: file.zipPath, error: 'Arquivo não encontrado' });
            }
        } catch (addError) {
            console.error(`Erro ao adicionar arquivo ${file.localPath} ao arquivo ZIP:`, addError);
            // Este erro também pode indicar problemas de permissão ou outros.
            // O Archiver 'error' listener também deve capturar isso.
        }
    });


    // --- Finaliza o Arquivamento ---
    // Finaliza o arquivamento. O evento 'end' no archive será disparado quando todos os
    // dados forem adicionados ao stream e o stream for finalizado.
    archive.finalize();

    // --- Evento 'end' do Arquivador (Arquivamento Completo) ---
    // O evento 'end' do archive dispara QUANDO TODO O CONTEÚDO FOI ARQUIVADO e está pronto para ser enviado.
    // Este evento é importante, mas a limpeza do DIRETÓRIO deve ser no 'close' do *response* stream.
    // archive.on('end', () => {
    //     console.log('Arquivamento finalizado.');
    //     // A limpeza do diretório temporário DEVE ser feita no 'close' event do stream de resposta (res)
    //     // para garantir que todos os dados foram lidos pelo stream antes de deletar os arquivos.
    // });


};

// Define a rota POST / que usa o handler
router.post('/', handleDownloadBatch);

module.exports = router; // Exporta o router