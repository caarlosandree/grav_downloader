// js/app.js (Arquivo Principal)

// Importa tudo que é necessário de outros módulos
import { MESSAGES, CHECKBOX_CONVERT_TO_MP3_ID, LOCAL_STORAGE_KEY } from './constants.js';
// Importa funções de domUtils (acesso a elementos DOM e manipulação básica de botões/status)
import {
    getElement, // Usado aqui para obter elementos do formulário principal e delegar listeners
    getChamadasTableBody, // Para o listener delegado da tabela
    getStatusMessageArea, // Para gerenciar a mensagem final de status aqui

    // Importa funções de manipulação de botões diretamente de domUtils
    getConsultarBtn, // Obtém referência do botão consultar
    getBaixarLoteBtn, // Obtém referência do botão baixar lote
    disableConsultarBtn, // Desabilita o botão Consultar
    enableConsultarBtn, // Habilita o botão Consultar
    disableBaixarLoteBtn, // Desabilita o botão Baixar Lote
    enableBaixarLoteBtn, // Habilita o botão Baixar Lote
    showBaixarLoteBtn, // Exibe o botão Baixar Lote
    hideBaixarLoteBtn, // Oculta o botão Baixar Lote

    // As funções de status (showStatus...) e controles de paginação/filtro
    // foram movidas para uiManager.js e são importadas de lá.
} from './domUtils.js';
import { salvarConfiguracoes, carregarConfiguracoes } from './storageUtils.js';
// Importa apenas as funções de validação de validationUtils.js
import { isValidDateTimeFormat, isValidUrlBase } from './validationUtils.js';

// Importa a função para download em lote do backend (ainda usada diretamente aqui)
// NOTE: fetchBackendZip é chamada DENTRO do downloadService agora. Remover importação direta aqui.
// import { fetchBackendZip } from './backendApi.js';
// Importa a função para salvar o arquivo (ainda usada diretamente aqui)
// NOTE: saveBlobAsFile é chamada DENTRO do downloadService agora. Remover importação direta aqui.
// import { saveBlobAsFile } from './fileUtils.js';


// Importa as funções de serviço e gerenciamento de UI
import { resetState, setAllResults, setUrlsGravacoesEncontradas, getState } from './state.js'; // Gerencia o estado da aplicação
import { fetchAllWidevoiceData } from './apiService.js'; // Lógica de busca fatiada na API WideVoice
import { applyFilters, clearFilters, clearFilterFields } from './filterService.js'; // Lógica de filtros
import { showPage, goToPreviousPage, goToNextPage } from './paginationService.js'; // Lógica de paginação (baseada nos resultados filtrados)
import { baixarGravacaoIndividual, baixarGravacoesEmLote } from './downloadService.js'; // Lógica de download
import {
    initializeUIState, // Função para configurar o estado inicial da UI
    // Funções de status e visibilidade/controle de elementos de UI (paginação, filtros) movidas para uiManager
    showStatusLoading, showStatusSuccess, showStatusError, showStatusWarning, clearStatus, // Gerencia mensagens de status
    showFilterSection, hideFilterSection, // Gerencia visibilidade da seção de filtros
    updatePaginationButtons, // Atualiza o estado dos botões de paginação e info (baseado em resultados filtrados)
    showPaginationControls, hidePaginationControls, // Gerencia visibilidade dos controles de paginação
} from './uiManager.js'; // Gerencia a interface do usuário


// --- Funções de Manipulação do Formulário Principal ---

// Função para obter e validar dados do formulário (Definida AQUI)
function getAndValidateFormData() {
    // Obtém referências usando getElement (importado de domUtils)
    const login = getElement('login')?.value.trim() || '';
    const token = getElement('token')?.value.trim() || '';
    const datainicioLocal = getElement('datainicio')?.value || '';
    const datafimLocal = getElement('datafim')?.value || '';
    let user_url = getElement('url_base')?.value.trim() || '';

    // Usa clearStatus de uiManager
    clearStatus();

    if (!login || !token || !datainicioLocal || !datafimLocal || !user_url) {
        // Usa showStatusWarning de uiManager
        showStatusWarning(MESSAGES.EMPTY_FIELDS);
        return null;
    }

    // Remove http(s):// se estiver presente para validação e uso na URL da gravação
    const cleanUserUrl = user_url.replace(/^https?:\/\//, '');
    // Usa isValidUrlBase de validationUtils
    if (!isValidUrlBase(cleanUserUrl)) {
        // Usa showStatusWarning de uiManager
        showStatusWarning(MESSAGES.INVALID_URL_BASE);
        return null;
    }


    // Converte datetime-local format (YYYY-MM-DDTHH:mm) para API format (YYYY-MM-DD HH:mm:ss) e para objeto Date
    const datainicioApi = datainicioLocal.replace('T', ' ') + ':00';
    const datafimApi = datafimLocal.replace('T', ' ') + ':00';

    // Valida o formato da API formatada, pois isValidDateTimeFormat espera 'YYYY-MM-DD HH:mm:ss'
    // Usa isValidDateTimeFormat de validationUtils
    if (!isValidDateTimeFormat(datainicioApi)) {
        // Usa showStatusError de uiManager
        showStatusError(MESSAGES.INTERNAL_DATE_FORMAT_ERROR.replace('Data.', 'Data Início.'));
        console.error("Erro de formato na data de início:", datainicioLocal);
        return null;
    }
    // Usa isValidDateTimeFormat de validationUtils
    if (!isValidDateTimeFormat(datafimApi)) {
        // Usa showStatusError de uiManager
        showStatusError(MESSAGES.INTERNAL_DATE_FORMAT_ERROR.replace('Data.', 'Data Fim.'));
        console.error("Erro de formato na data de fim:", datafimLocal);
        return null;
    }

    // Cria objetos Date para validação de intervalo
    const dateInicioObj = new Date(datainicioLocal);
    const dateFimObj = new Date(datafimLocal);

    // Verifica se os objetos Date são válidos
    if (isNaN(dateInicioObj.getTime()) || isNaN(dateFimObj.getTime())) {
        // Usa showStatusError de uiManager
        showStatusError(MESSAGES.INTERNAL_DATE_FORMAT_ERROR + " Erro ao processar datas selecionadas.");
        console.error("Datas inválidas após conversão:", datainicioLocal, datafimLocal);
        return null;
    }


    if (dateFimObj < dateInicioObj) {
        // Usa showStatusWarning de uiManager
        showStatusWarning(MESSAGES.DATE_RANGE_ERROR);
        return null;
    }

    return { login, token, datainicioApi, datafimApi, cleanUserUrl, dateInicioObj, dateFimObj };
}


// Função principal para iniciar a consulta
export async function consultarChamadas() {
    // Gerencia o estado inicial dos botões e status
    disableConsultarBtn(); // Chamada diretamente de domUtils (importada aqui)
    clearStatus(); // Chamada de uiManager (importada aqui)

    // Limpa todos os estados anteriores (resultados brutos, filtrados, paginação, filtros da UI)
    resetState(); // Chamada de state.js
    const chamadasTableBody = getChamadasTableBody(); // Chamada de domUtils
    if (chamadasTableBody) chamadasTableBody.innerHTML = ''; // Limpa a tabela

    // Limpa e oculta os campos de filtro no início de uma nova consulta
    clearFilterFields(); // Chamada de filterService
    hideFilterSection(); // Chamada de uiManager

    // Atualiza o estado inicial da UI (botões de download/paginação desabilitados/ocultos, info de página 0 de 0)
    initializeUIState(); // Chamada de uiManager


    // Chamada da função local getAndValidateFormData
    const formData = getAndValidateFormData();
    if (!formData) {
        enableConsultarBtn(); // Reabilita Consultar se validação falhou (Chamada diretamente de domUtils)
        // status já foi mostrado em getAndValidateFormData
        return; // Sai se a validação falhou
    }

    salvarConfiguracoes(); // Chamada de storageUtils


    try {
        // Chama a função do apiService para buscar todos os dados brutos
        // Passa as callbacks de status (de uiManager) para apiService usar
        const rawResults = await fetchAllWidevoiceData(
            formData.cleanUserUrl,
            formData.login,
            formData.token,
            formData.datainicioApi, // API formatted string
            formData.datafimApi,   // API formatted string
            { showStatusLoading, showStatusWarning, showStatusError, clearStatus } // Passa objeto com funções de status de uiManager
        );

        // Armazena os resultados brutos no estado
        setAllResults(rawResults); // Chamada de state.js

        // Filtra os resultados brutos para pegar apenas as gravações encontradas
        const recordingsOnly = rawResults
            .filter(chamada => chamada.gravacao && typeof chamada.gravacao === 'string' && chamada.gravacao.trim() !== '') // Filtra APENAS quem tem gravação
            .map(chamada => {
                // CONSTRUÇÃO DO OBJETO DE GRAVAÇÃO COM URL COMPLETA E CAMPOS DESEJADOS
                const caminho = chamada.gravacao.replaceAll("\\/", "/");
                // A API pode fornecer 'recording_url' diretamente, priorizar se existir e for válida
                const urlGravacao = chamada.recording_url && typeof chamada.recording_url === 'string' && chamada.recording_url.trim() !== ''
                    ? chamada.recording_url.trim()
                    // Fallback para construir a URL se 'recording_url' não estiver disponível ou for inválida
                    // Garante que cleanUserUrl existe antes de construir a URL
                    : (caminho && formData.cleanUserUrl ? `https://${formData.cleanUserUrl}/gravador28/${caminho}.gsm` : '#');


                let origem = 'N/A';
                let destino = 'N/A';
                // Ajuste a lógica de Origem/Destino aqui se necessário, com base em como a API retorna os campos
                if (chamada.chamada === 'E') { // Chamada de Entrada
                    origem = chamada.call_entrada || chamada.numero || 'N/A'; // Prioriza call_entrada, fallback para numero
                    destino = chamada.ramal || 'N/A'; // Destino é o ramal interno
                } else if (chamada.chamada === 'S') { // Chamada de Saída
                    origem = chamada.ramal || 'N/A'; // Origem é o ramal interno
                    destino = chamada.numero || chamada.call_entrada || 'N/A'; // Destino é o número externo ou call_entrada
                } else { // Outros tipos ou desconhecido
                    origem = chamada.ramal || chamada.numero || chamada.call_entrada || 'N/A';
                    destino = chamada.numero || chamada.call_entrada || chamada.ramal || 'N/A'; // Tenta adivinhar destino
                }


                return {
                    datahora: (chamada.datahora || '').replace(/\s+/g, ' ').trim(), // <-- CORRIGIDO AQUI
                    src: origem,
                    dst: destino,
                    duration: chamada.duracao,
                    url_gravacao: urlGravacao,
                    nomeoperador: chamada.nomeoperador,
                    ramal: chamada.ramal
                };
            })
            // Filtra novamente para garantir que APENAS itens com uma URL de gravação válida
            // NO CAMPO QUE O BACKEND ESPERA ('url_gravacao') vão para a lista final
            .filter(item => item.url_gravacao && typeof item.url_gravacao === 'string' && item.url_gravacao !== '#' && item.url_gravacao.trim() !== '');


        // Armazena a lista de gravações encontradas no estado (agora com 'url_gravacao')
        setUrlsGravacoesEncontradas(recordingsOnly); // Chamada de state.js


        // ** APLICA OS FILTROS INICIAIS (que serão filtros vazios) APÓS OBTER AS GRAVAÇÕES **
        // Isso popula currentlyFilteredResults (em state.js) e chama displayResultsPage (via uiManager)
        // e atualiza o estado dos botões/paginação/filtros com base nos resultados filtrados.
        applyFilters(); // Chamada de filterService


        // Gerencia a mensagem final de status
        const { currentlyFilteredResults } = getState(); // Pega o estado mais recente após os filtros
        const numGravacoesEncontradas = recordingsOnly.length; // Número de gravações encontradas (antes dos filtros)
        const numGravacoesFiltradas = currentlyFilteredResults.length; // Número de gravações após filtros
        const totalResultadosBrutos = rawResults.length; // Número total de resultados da API

        const statusArea = getStatusMessageArea(); // Chamada de domUtils
        // Verifica se a mensagem de limite máximo JÁ FOI exibida (pelo apiService)
        const limitWarningAlreadyShown = statusArea?.classList.contains('warning') && (statusArea?.textContent || '').includes('Limite máximo de páginas');

        // Usa MESSAGES.FINAL_RESULTS_DISPLAY (agora uma função)
        let statusMessageText = `${MESSAGES.FINAL_RESULTS_DISPLAY(totalResultadosBrutos)}. `;

        if (numGravacoesEncontradas === numGravacoesFiltradas) {
            statusMessageText += `${numGravacoesEncontradas} gravação(ões) encontrada(s).`;
        } else {
            statusMessageText += `${numGravacoesEncontradas} gravação(ões) encontrada(s) (${numGravacoesFiltradas} após filtros).`;
        }

        // Atualiza a mensagem de status (mantendo o aviso de limite se aplicável)
        if (!limitWarningAlreadyShown) {
            showStatusSuccess(statusMessageText); // Chamada de uiManager
        } else {
            // Se o limite máximo foi atingido, adiciona a contagem à mensagem existente
            const currentStatusText = statusArea?.textContent || '';
            if (statusArea) {
                // Evita duplicar a mensagem de contagem
                if (!currentStatusText.includes('gravação(ões) encontrada(s)')) {
                    statusArea.textContent = `${currentStatusText.trim()} ${statusMessageText}`;
                    statusArea.classList.add('warning'); // Garante que a classe warning esteja lá
                }
            }
        }

        // Visibilidade do botão de lote e paginação já gerenciada por applyFilters (chamada acima)
        // updatePaginationButtons() já chamado por applyFilters


    } catch (erro) {
        // Lidar com quaisquer erros que ocorreram durante as requisições ou processamento inicial
        handleApiError(erro); // Chamada da função local handleApiError
    } finally {
        // Garante que o botão Consultar seja reabilitado SEMPRE
        enableConsultarBtn(); // Chamada diretamente de domUtils (importada aqui)
        // A habilitação/desabilitação final do botão de baixar lote e paginação
        // é gerenciada por applyFilters (chamada no try) ou initializeUIState (chamada no início do try)
    }
}


// --- Funções de Limpeza (Mantida no app.js principal) ---
export function limparCampos() {
    // Obtém referências usando getElement (importado de domUtils)
    const urlBaseInput = getElement('url_base');
    const loginInput = getElement('login');
    const tokenInput = getElement('token');
    const datainicioInput = getElement('datainicio');
    const datafimInput = getElement('datafim');
    const chamadasTableBody = getChamadasTableBody(); // Chamada de domUtils
    const convertCheckbox = getElement(CHECKBOX_CONVERT_TO_MP3_ID); // Usa a constante

    // Limpa os valores dos campos
    if (urlBaseInput) urlBaseInput.value = '';
    if (loginInput) loginInput.value = '';
    if (tokenInput) tokenInput.value = '';
    if (datainicioInput) datainicioInput.value = '';
    if (datafimInput) datafimInput.value = '';
    if (convertCheckbox) convertCheckbox.checked = false; // Desmarca o checkbox

    if (chamadasTableBody) chamadasTableBody.innerHTML = ''; // Limpa a tabela

    clearStatus(); // Limpa status (Chamada de uiManager)

    // Reseta o estado central da aplicação
    resetState(); // Chamada de state.js

    // Limpa e oculta os campos de filtro
    clearFilterFields(); // Chamada de filterService
    hideFilterSection(); // Chamada de uiManager

    // Atualiza o estado da UI (botões de download/paginação desabilitados/ocultos, info de página 0 de 0)
    initializeUIState(); // Chamada de uiManager

    // Remove as configurações salvas
    try {
        localStorage.removeItem(LOCAL_STORAGE_KEY); // Usa a constante
        console.log('Configurações removidas do localStorage.');
    } catch (e) {
        console.error('Erro ao remover configurações do localStorage:', e);
    }

    console.log('Campos e resultados limpos.');
}


// --- Funções de Exibir Erros (Mantida no app.js principal) ---
// Esta função lida com erros CRÍTICOS da consulta API ou outros erros globais
function handleApiError(erro) {
    const consultarBtn = getConsultarBtn(); // Chamada de domUtils
    // const baixarLoteBtn = getBaixarLoteBtn(); // Não necessário aqui, estado gerenciado por initializeUIState

    console.error('Erro na consulta:', erro);
    showStatusError(erro.message || 'Ocorreu um erro desconhecido durante a consulta.'); // Chamada de uiManager

    const chamadasTableBody = getChamadasTableBody(); // Chamada de domUtils
    if (chamadasTableBody) chamadasTableBody.innerHTML = '';

    // Reseta o estado em caso de erro
    resetState(); // Chamada de state.js

    // Limpa e oculta os campos de filtro
    clearFilterFields(); // Chamada de filterService
    hideFilterSection(); // Chamada de uiManager

    // Atualiza o estado da UI para refletir o erro (botões desabilitados, paginação oculta, etc.)
    initializeUIState(); // Garante que UI está limpa e botões/paginação/filtros ocultos/desabilitados

    if (consultarBtn) enableConsultarBtn(); // Reabilita o botão Consultar (Chamada de domUtils)
    // Botão de baixar lote já desabilitado por initializeUIState
}


// --- Event Listeners ---

// Carrega configurações ao carregar a janela
window.addEventListener('load', carregarConfiguracoes); // Chamada de storageUtils

// Adiciona os event listeners aos botões e links de gravação (delegado)
document.addEventListener('DOMContentLoaded', () => {
    const consultarBtn = getConsultarBtn(); // Chamada de domUtils
    if(consultarBtn) {
        consultarBtn.addEventListener('click', consultarChamadas); // Chama a função local consultarChamadas
    }

    const limparCamposBtn = getElement('limparCamposBtn'); // Chamada de domUtils
    if(limparCamposBtn) {
        limparCamposBtn.addEventListener('click', limparCampos); // Chama a função local limparCampos
    }

    const baixarLoteBtn = getBaixarLoteBtn(); // Obtém a referência ao botão de lote (Chamada de domUtils)
    if(baixarLoteBtn) {
        // O event listener para o botão de lote AGORA CHAMA a função do downloadService
        baixarLoteBtn.addEventListener('click', baixarGravacoesEmLote); // Chama a função de downloadService
    }


    // Event listeners para paginação (AGORA CHAMAM FUNÇÕES DO paginationService)
    const prevPageBtn = getElement('prevPageBtn'); // Obtém a referência (Chamada de domUtils)
    if(prevPageBtn) {
        prevPageBtn.addEventListener('click', goToPreviousPage); // Chama a função de paginationService
    }

    const nextPageBtn = getElement('nextPageBtn'); // Obtém a referência (Chamada de domUtils)
    if(nextPageBtn) {
        nextPageBtn.addEventListener('click', goToNextPage); // Chama a função de paginationService
    }

    // Event listeners para os botões de filtro (AGORA CHAMAM FUNÇÕES DO filterService)
    const applyFiltersBtn = getElement('applyFiltersBtn'); // Chamada de domUtils
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters); // Chama a função de filterService
    }

    const clearFiltersBtn = getElement('clearFiltersBtn'); // Chamada de domUtils
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearFilters); // Chama a função de filterService
    }


    // ** Delegação de Eventos para os links de Download Individual na Tabela **
    // Adicionamos um único listener ao corpo da tabela e verificamos se o clique
    // ocorreu em um link de download.
    const chamadasTableBody = getChamadasTableBody(); // Obtém a referência (Chamada de domUtils)
    if (chamadasTableBody) {
        chamadasTableBody.addEventListener('click', (event) => {
            const target = event.target;
            // Verifica se o elemento clicado ou um de seus ancestrais é um link de download
            const downloadLink = target.closest('.download-link');

            if (downloadLink && !downloadLink.classList.contains('disabled-link')) { // Adicionado verificação para links desabilitados
                event.preventDefault(); // Impede a ação padrão do link
                const recordingUrl = downloadLink.dataset.recordingUrl; // Obtém a URL do atributo data

                if (recordingUrl) {
                    // CHAMA A FUNÇÃO DO downloadService
                    baixarGravacaoIndividual(recordingUrl); // Chama a função de downloadService
                } else {
                    console.error("URL de gravação não encontrada no atributo data-recording-url.");
                    // Mensagem de erro é tratada dentro de baixarGravacaoIndividual
                }
            }
        });
    }


    // Inicializa o estado da UI na carga inicial da página
    initializeUIState(); // Chamada de uiManager

    console.log("Event listeners adicionados. app.js inicializado.");
});