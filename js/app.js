// Importa tudo que é necessário de outros módulos
import { MESSAGES, API_LIMIT_PER_PAGE, MAX_PAGES_CONSULTATION } from './constants.js';
// Importa funções de domUtils (não precisamos importar showStatus diretamente aqui, usamos as de atalho)
import { getElement, getChamadasTableBody, getBaixarLoteBtn, getConsultarBtn, showStatusLoading, showStatusSuccess, showStatusError, showStatusWarning, clearStatus, disableConsultarBtn, enableConsultarBtn, disableBaixarLoteBtn, enableBaixarLoteBtn, showBaixarLoteBtn, hideBaixarLoteBtn, getStatusMessageArea } from './domUtils.js';
import { salvarConfiguracoes, carregarConfiguracoes } from './storageUtils.js';
import { isValidDateTimeFormat, isValidUrlBase } from './validationUtils.js';
// Importa a função da API Widevoice (vamos manter a função de fatiamento temporal aqui, como estava)
// Não precisamos importar fetchWidevoiceDataByDateRange aqui se ela for definida no mesmo arquivo
// import { fetchWidevoiceDataByDateRange } from './widevoiceApi.js'; // Removida a importação se definida localmente

import { fetchBackendZip } from './backendApi.js'; // Importa a função do Backend API
import { saveBlobAsFile } from './fileUtils.js'; // Importa a função de salvar arquivo


// --- Variáveis de Estado ---
let urlsGravacoesEncontradas = []; // Armazena objetos { url: string, datahora: string }


// --- Funções de Manipulação do Formulário e Botões ---

export function limparCampos() {
    const urlBaseInput = getElement('url_base');
    const loginInput = getElement('login');
    const tokenInput = getElement('token');
    const datainicioInput = getElement('datainicio');
    const datafimInput = getElement('datafim');
    const chamadasTableBody = getChamadasTableBody();

    if (urlBaseInput) urlBaseInput.value = '';
    if (loginInput) loginInput.value = '';
    if (tokenInput) tokenInput.value = '';
    if (datainicioInput) datainicioInput.value = '';
    if (datafimInput) datafimInput.value = '';

    if (chamadasTableBody) chamadasTableBody.innerHTML = '';
    clearStatus();
    urlsGravacoesEncontradas = [];

    hideBaixarLoteBtn();
    enableBaixarLoteBtn();
    enableConsultarBtn();

    console.log('Campos e resultados limpos.');
}

function getAndValidateFormData() {
    const login = getElement('login')?.value.trim() || '';
    const token = getElement('token')?.value.trim() || '';
    const datainicioLocal = getElement('datainicio')?.value || '';
    const datafimLocal = getElement('datafim')?.value || '';
    let user_url = getElement('url_base')?.value.trim() || '';

    clearStatus();

    if (!login || !token || !datainicioLocal || !datafimLocal || !user_url) {
        showStatusWarning(MESSAGES.EMPTY_FIELDS);
        return null;
    }

    if (!isValidUrlBase(user_url.replace(/^https?:\/\//, ''))) {
        showStatusWarning(MESSAGES.INVALID_URL_BASE);
        return null;
    }

    // Converte datetime-local format (YYYY-MM-DDTHH:mm) para API format (YYYY-MM-DD HH:mm:ss) e para objeto Date
    const datainicioApi = datainicioLocal.replace('T', ' ') + ':00';
    const datafimApi = datafimLocal.replace('T', ' ') + ':00';

    if (!isValidDateTimeFormat(datainicioApi)) {
        showStatusError(MESSAGES.INTERNAL_DATE_FORMAT_ERROR.replace('Data.', 'Data Início.'));
        return null;
    }
    if (!isValidDateTimeFormat(datafimApi)) {
        showStatusError(MESSAGES.INTERNAL_DATE_FORMAT_ERROR.replace('Data.', 'Data Fim.'));
        return null;
    }

    const dateInicioObj = new Date(datainicioLocal);
    const dateFimObj = new Date(datafimLocal);

    if (dateFimObj < dateInicioObj) {
        showStatusWarning(MESSAGES.DATE_RANGE_ERROR);
        return null;
    }

    const cleanUserUrl = user_url.replace(/^https?:\/\//, '');

    // Retornando dateFimObj (nome correto)
    return { login, token, datainicioApi, datafimApi, cleanUserUrl, dateInicioObj, dateFimObj };
}


// --- Funções de Exibição de Resultados ---
// Esta função agora não limpa o status, pois o status final é definido na função consultarChamadas
export function displayResults(dados, userUrlBase) {
    const chamadasTableBody = getChamadasTableBody();
    const baixarLoteBtn = getBaixarLoteBtn();

    if (!chamadasTableBody) return;

    chamadasTableBody.innerHTML = '';
    urlsGravacoesEncontradas = [];

    // Removido clearStatus(); daqui

    const chamadasComGravacao = Array.isArray(dados) ? dados.filter(chamada => chamada.gravacao) : [];


    if (chamadasComGravacao.length === 0) {
        // Se displayResults for chamada com 0 resultados (ex: consulta vazia ou sem gravações),
        // o status já foi definido em consultarChamadas.
        hideBaixarLoteBtn();
        return;
    }

    chamadasComGravacao.forEach(chamada => {
        const row = document.createElement('tr');

        const numeroCell = document.createElement('td');
        numeroCell.textContent = chamada.numero;
        numeroCell.setAttribute('data-label', 'Número'); // Adiciona data-label
        row.appendChild(numeroCell);

        const datahoraCell = document.createElement('td');
        datahoraCell.textContent = chamada.datahora; // Usa a datahora original da API
        datahoraCell.setAttribute('data-label', 'Data/Hora'); // Adiciona data-label
        row.appendChild(datahoraCell);

        const duracaoCell = document.createElement('td');
        duracaoCell.innerHTML = `${chamada.duracao} <em>segundos</em>`; // Mantido <em> para segundos
        duracaoCell.setAttribute('data-label', 'Duração (s)'); // Adiciona data-label
        row.appendChild(duracaoCell);

        const gravacaoCell = document.createElement('td');
        const caminho = chamada.gravacao.replaceAll("\\/", "/");
        const urlGravacao = `https://${userUrlBase}/gravador28/${caminho}.gsm`;

        // Armazena o URL e a datahora original para o download em lote
        urlsGravacoesEncontradas.push({ url: urlGravacao, datahora: chamada.datahora });

        const linkGravacao = document.createElement('a');
        linkGravacao.href = urlGravacao;
        linkGravacao.target = '_blank';
        // Usa ícone no link de download
        linkGravacao.innerHTML = `<i class="fas fa-download"></i> ${MESSAGES.TEXT_BAIXAR_GRAVACAO}`; // Adiciona ícone
        gravacaoCell.appendChild(linkGravacao);
        gravacaoCell.setAttribute('data-label', 'Gravação'); // Adiciona data-label


        row.appendChild(gravacaoCell);

        chamadasTableBody.appendChild(row);
    });


    if (baixarLoteBtn && urlsGravacoesEncontradas.length > 0) {
        showBaixarLoteBtn();
    }
}


// --- Função para Exibir Erros da API de Consulta (Widevoice API) ---
function handleApiError(erro) {
    const consultarBtn = getConsultarBtn();
    const baixarLoteBtn = getBaixarLoteBtn();
    const chamadasTableBody = getChamadasTableBody();

    console.error('Erro na consulta:', erro);
    showStatusError(erro.message || 'Ocorreu um erro desconhecido durante a consulta.');

    if (chamadasTableBody) chamadasTableBody.innerHTML = '';

    if (consultarBtn) enableConsultarBtn(); // Reabilita o botão Consultar
    if (baixarLoteBtn) {
        hideBaixarLoteBtn(); // Garante que seja oculto em caso de erro na consulta
        enableBaixarLoteBtn(); // Garante que seja reabilitado
    }
}


// --- Funções de Consulta API (COM PAGINAÇÃO POR FATIAMENTO TEMPORAL) ---

// Função auxiliar para buscar dados da API Widevoice usando intervalo de datas
// Implementa a lógica de fatiamento temporal.
// Esta função é uma helper INTERNA de consultarChamadas, NÃO PRECISA ser exportada.
async function fetchWidevoiceDataByDateRange(urlBase, login, token, currentSearchStartApi, currentSearchEndApi, page) {
    // A URL não tem offset/limit, apenas acao=statusreport e credenciais
    const url = `https://${urlBase}/api.php?acao=statusreport&login=${login}&token=${token}`;
    // O intervalo de data/hora é passado no payload POST
    const payload = { datainicio: currentSearchStartApi, datafim: currentSearchEndApi };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        let errorMessage = `${MESSAGES.FETCH_ERROR} ${response.status} ao buscar página ${page} (faixa ${currentSearchStartApi} a ${currentSearchEndApi})`;
        if (response.status === 401) {
            errorMessage = MESSAGES.AUTH_ERROR;
        } else if (response.status >= 400 && response.status < 500) {
            errorMessage = `${MESSAGES.CLIENT_ERROR} ${response.status}. Verifique os dados informados.`;
        } else if (response.status >= 500) {
            errorMessage = `${MESSAGES.SERVER_ERROR} ${response.status}. Tente novamente mais tarde.`;
        }
        try {
            const errorData = await response.json();
            if (errorData && (errorData.message || errorData.error)) {
                errorMessage += ` - Detalhes: ${errorData.message || errorData.error}`;
            }
        } catch (jsonError) {
            console.warn(`Não foi possível parsear JSON de erro do corpo da resposta da API (página ${page}):`, jsonError);
        }
        throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
        throw new Error(`Resposta inesperada da API ao buscar página ${page}. Esperado um array, mas recebeu: ${typeof data}. Resposta: ${JSON.stringify(data)}`);
    }

    return data; // Retorna o array de resultados da página
}


export async function consultarChamadas() {
    // Gerencia o estado dos botões e status no início
    disableConsultarBtn();
    hideBaixarLoteBtn();
    enableBaixarLoteBtn(); // Garante que não fique desabilitado se estava
    clearStatus();
    const chamadasTableBody = getChamadasTableBody();
    if (chamadasTableBody) chamadasTableBody.innerHTML = ''; // Limpa a tabela
    urlsGravacoesEncontradas = []; // Limpa resultados anteriores

    const formData = getAndValidateFormData();
    if (!formData) {
        enableConsultarBtn();
        // clearStatus() já foi chamado em getAndValidateFormData
        return;
    }

    showStatusLoading(MESSAGES.LOADING + ' (Iniciando busca por fatiamento temporal...)');
    salvarConfiguracoes();

    let allResults = [];
    let page = 1; // Usado para feedback e log, representando cada tentativa/faixa de busca.
    // Variável para controlar o início do próximo intervalo de busca (começa com o datainicio original)
    let currentSearchStart = new Date(formData.dateInicioObj); // Começa com o objeto Date original
    const originalSearchEnd = new Date(formData.dateFimObj); // Mantém o objeto Date original de fim


    try {
        // Loop de busca baseado em data/hora. Continua enquanto o início da busca atual não exceder o fim original.
        while (currentSearchStart <= originalSearchEnd) {

            // Verifica se o limite máximo de páginas foi atingido como salvaguarda
            if (page > MAX_PAGES_CONSULTATION) {
                console.warn(`Limite máximo de páginas (${MAX_PAGES_CONSULTATION}) atingido. Interrompendo a busca.`);
                // Exibe o aviso de limite máximo imediatamente
                showStatusWarning(`⚠️ Limite máximo de páginas (${MAX_PAGES_CONSULTATION}) atingido. Resultados podem estar incompletos.`);
                // Quebra o loop
                break;
            }

            // Converte o início da busca atual (Date object) para o formato da API (YYYY-MM-DD HH:mm:ss)
            // E garante que não exceda a datafim original.
            const startApiFormatted = `${currentSearchStart.getFullYear()}-${String(currentSearchStart.getMonth() + 1).padStart(2, '0')}-${String(currentSearchStart.getDate()).padStart(2, '0')} ${String(currentSearchStart.getHours()).padStart(2, '0')}:${String(currentSearchStart.getMinutes()).padStart(2, '0')}:${String(currentSearchStart.getSeconds()).padStart(2, '0')}`;

            // A data/hora final da requisição é a datafim original da consulta.
            // A API limita os 500 resultados DENTRO desse intervalo.
            const endApiFormatted = formData.datafimApi;


            // Atualiza o feedback de carregamento para a faixa de data/hora atual
            showStatusLoading(`${MESSAGES.LOADING} (Buscando faixa ${startApiFormatted} até ${endApiFormatted} - tentativa ${page}, Total atual: ${allResults.length})...`);


            // Busca os dados para a faixa de data/hora atual usando a função auxiliar
            const data = await fetchWidevoiceDataByDateRange(
                formData.cleanUserUrl,
                formData.login,
                formData.token,
                startApiFormatted, // Usa o início da busca atual (string formatada)
                endApiFormatted,   // Usa o fim original da consulta (string formatada)
                page                   // Passa o número da página/tentativa para mensagens de erro/log
            );

            // --- Condições de parada do loop ---

            // 1. Checa primeiro se a API retornou um array vazio para este intervalo.
            // Isso geralmente significa que não há mais dados NESTA faixa ou posterior.
            if (data.length === 0) {
                console.log(`API retornou 0 resultados para faixa ${startApiFormatted} a ${endApiFormatted}. Parando a busca.`);
                // Limpa o status de carregamento e exibe uma mensagem de sucesso final (se não já foi definido por limite max)
                if (!getStatusMessageArea()?.innerHTML.includes('Limite máximo')) {
                    clearStatus(); // Limpa o status de carregamento
                    // Verifica se já havia resultados antes de parar para não exibir sucesso com 0 total se o primeiro fetch já foi 0
                    if (allResults.length > 0) {
                        showStatusSuccess(`${MESSAGES.FINAL_RESULTS_DISPLAY(allResults.length)}. Total de resultados finais: ${allResults.length}`);
                    }
                }
                // Não precisamos concatenar data aqui, pois é vazio.
                break; // Sai do loop principal de paginação
            }


            // 2. Se chegou até aqui, a API retornou dados (data.length > 0). Adiciona esses resultados aos resultados totais.
            allResults = allResults.concat(data);

            // 3. Se a quantidade de resultados retornados é menor que o limite de 500, significa que esta é a última página com dados
            // NESTA faixa temporal e, provavelmente, em todas as faixas subsequentes até a datafim original.
            if (data.length < API_LIMIT_PER_PAGE) {
                console.log(`API retornou ${data.length} resultados (< ${API_LIMIT_PER_PAGE}) para faixa ${startApiFormatted} a ${endApiFormatted}. Assumindo fim da busca.`);
                // Limpa o status de carregamento e exibe uma mensagem de sucesso final (se não já foi definido por limite max)
                if (!getStatusMessageArea()?.innerHTML.includes('Limite máximo')) {
                    clearStatus(); // Limpa o status de carregamento
                    showStatusSuccess(`${MESSAGES.FINAL_RESULTS_DISPLAY(allResults.length)}. Total de resultados finais: ${allResults.length}`);
                }
                break; // Sai do loop principal de paginação
            }


            // Se o loop não parou (data.length === API_LIMIT_PER_PAGE),
            // significa que há pelo menos 500 resultados NESTA faixa temporal.
            // Precisamos encontrar a data/hora mais recente entre eles
            // e definir o início da próxima busca para 1 segundo após essa data/hora.
            try {
                // Encontra o registro com a data/hora mais recente no array 'data'
                // Assume que 'datahora' existe e é comparável como string 'YYYY-MM-DD HH:mm:ss'
                const latestRecord = data.reduce((latest, current) => {
                    if (!latest || (current.datahora && current.datahora > latest.datahora)) {
                        return current;
                    }
                    return latest;
                }, null);

                const latestDatahoraStr = latestRecord?.datahora;


                if (!latestDatahoraStr) {
                    // Se nenhum registro válido com datahora foi encontrado nos 500 resultados
                    // Isso é um erro grave na resposta da API se ela retornou 500 resultados mas nenhum com datahora
                    throw new Error("Nenhum registro com campo 'datahora' válido encontrado nos resultados da página.");
                }

                // Converte a string datahora mais recente para um objeto Date
                // Substitui o espaço por 'T' para parsing confiável no construtor Date (formato ISO 8601)
                const latestDate = new Date(latestDatahoraStr.replace(' ', 'T'));

                if (isNaN(latestDate.getTime())) {
                    throw new Error(`Datahora inválida no último registro ('${latestDatahoraStr}').`);
                }

                // Define o início da próxima busca como 1 segundo após a data mais recente
                currentSearchStart = new Date(latestDate.getTime() + 1000);

                // Loga a data de início da próxima busca (no fuso horário local do navegador para clareza)
                console.log(`Faixa retornou ${API_LIMIT_PER_PAGE} resultados. Próxima busca inicia em ${currentSearchStart.toLocaleString()}.`);

            } catch (dateError) {
                console.error(`Erro ao determinar o início da próxima faixa de busca: ${dateError.message}`, dateError);
                showStatusError(`❌ Erro ao processar data do último registro na tentativa ${page}: ${dateError.message}. Busca interrompida.`);
                break; // Aborta a busca em caso de erro na data do último registro
            }

            // Incrementa a página/tentativa de busca para o feedback
            page++;

            // O loop continua se currentSearchStart ainda for <= originalSearchEnd e não houve break.

        } // Fim do loop while (currentSearchStart <= originalSearchEnd)


        // Trata o caso onde NENHUM resultado foi encontrado em NENHUMA página (allResults.length é 0)
        // Verifica se o status já não foi definido (por erro, limite máximo, ou sucesso com 0 resultados)
        if (allResults.length === 0 && getStatusMessageArea()?.className !== 'error' && getStatusMessageArea()?.className !== 'warning' && !getStatusMessageArea()?.innerHTML.includes('✅ Busca finalizada')) {
            showStatusWarning(MESSAGES.NO_RESULTS); // Assume que a busca retornou 0 total
        }


        // 6. Processa e exibe TODOS os resultados combinados (agora em allResults)
        // displayResults foi ajustada para não limpar o status ao ser chamada
        displayResults(allResults, formData.cleanUserUrl);

    } catch (erro) {
        // Lidar com quaisquer erros que ocorreram durante as requisições (HTTP fetch, array inválido, etc.)
        handleApiError(erro); // Usa a função centralizada para exibir o erro

    } finally {
        // Garante que o botão Consultar seja reabilitado
        enableConsultarBtn();
        // Garante que o botão de download em lote seja tratado (exibido ou oculto)
        const baixarLoteBtnFinal = getBaixarLoteBtn();
        if (baixarLoteBtnFinal) {
            if (urlsGravacoesEncontradas.length > 0) {
                showBaixarLoteBtn();
            } else {
                hideBaixarLoteBtn();
            }
            enableBaixarLoteBtn(); // Garante que não fique desabilitado
        }
    }
}


// --- Funções de Download em Lote ---

// Função principal do botão de download em lote (apenas confirmação e chamada)
export async function baixarGravacoesEmLote() {
    const numGravacoes = urlsGravacoesEncontradas.length;

    if (numGravacoes === 0) {
        alert(MESSAGES.NO_RECORDINGS_TO_DOWNLOAD);
        return;
    }

    const confirmarDownload = confirm(MESSAGES.DOWNLOAD_CONFIRM(numGravacoes));

    if (!confirmarDownload) {
        showStatusWarning(MESSAGES.DOWNLOAD_CANCELLED);
        return;
    }

    // Chama a função auxiliar que faz a comunicação com o backend e salva o arquivo
    // fetchAndSaveZipFromBackend agora gerencia o estado dos botões e status internamente
    fetchAndSaveZipFromBackend(urlsGravacoesEncontradas);
}

// Função auxiliar para baixar o arquivo ZIP do backend e salvar (agora separada)
async function fetchAndSaveZipFromBackend(recordingsList) {
    const baixarLoteBtn = getBaixarLoteBtn();

    showStatusLoading(MESSAGES.DOWNLOAD_PROCESSING);
    if (baixarLoteBtn) disableBaixarLoteBtn(); // Desabilita o botão

    try {
        // Utiliza a função de fetch para o backend importada
        const response = await fetchBackendZip(recordingsList);

        // --- TRATAMENTO DA RESPOSTA DO BACKEND (COM DETALHES DE ERRO) ---
        if (!response.ok) {
            console.error(`Resposta de erro do backend: Status ${response.status}`);

            try {
                const errorData = await response.json();
                console.error('Dados de erro do backend:', errorData);

                if (errorData && (errorData.error || errorData.details || errorData.failedDownloads)) {
                    const errorMsg = errorData.error || errorData.details || `Status: ${response.status}`;
                    const failedItems = errorData.failedDownloads;

                    showStatusError(MESSAGES.DOWNLOAD_FAILED_DETAILS(errorMsg, failedItems));
                    return; // Sai da função após tratar o erro detalhado

                } else {
                    console.warn('Resposta de erro do backend inesperada (formato JSON desconhecido).');
                    // Lança um erro para ser capturado pelo catch principal
                    throw new Error(`Erro no formato da resposta de erro do backend. Status ${response.status}. Resposta JSON: ${JSON.stringify(errorData)}`);
                }

            } catch (jsonError) {
                console.error('Erro ao ler resposta de erro do backend como JSON, tentando como texto:', jsonError);
                try {
                    const errorText = await response.text();
                    console.error('Corpo da resposta de erro como texto:', errorText);
                    // Lança um erro com o status e o texto da resposta como detalhes
                    throw new Error(`Erro do backend: Status ${response.status}. Resposta: ${errorText}`);
                } catch (textError) {
                    // Lança um erro se não conseguir ler nem como texto
                    throw new Error(`Erro do backend: Status ${response.status}. Não foi possível ler a resposta.`);
                }
            }
        }

        // ** SE response.ok FOR TRUE (Status 200 OK) **
        // LER O CORPO DA RESPOSTA COMO BLOB (É O ARQUIVO ZIP)
        console.log('Resposta do backend recebida (Status 200 OK). Lendo corpo como Blob...');
        const zipBlob = await response.blob();

        // Utiliza a função de salvar arquivo importada
        saveBlobAsFile(zipBlob, response.headers);

        // Feedback de sucesso é dado DENTRO de saveBlobAsFile

    } catch (error) {
        console.error('Erro na comunicação com o backend ou processamento/exibição do erro no frontend:', error);
        showStatusError(`❌ Erro: ${error.message}`); // Exibe o erro formatado

    } finally {
        // Reabilita o botão ao final
        if (baixarLoteBtn) enableBaixarLoteBtn();
    }
}


// --- Event Listeners ---

// Carrega configurações ao carregar a janela
window.addEventListener('load', carregarConfiguracoes);

// Adiciona os event listeners aos botões usando o DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const consultarBtn = getConsultarBtn();
    if(consultarBtn) {
        consultarBtn.addEventListener('click', consultarChamadas);
    }

    // Usa o ID corrigido 'limparCamposBtn'
    const limparCamposBtn = getElement('limparCamposBtn');
    if(limparCamposBtn) {
        limparCamposBtn.addEventListener('click', limparCampos);
    }

    const baixarLoteBtn = getBaixarLoteBtn();
    if(baixarLoteBtn) {
        baixarLoteBtn.addEventListener('click', baixarGravacoesEmLote);
    }
});