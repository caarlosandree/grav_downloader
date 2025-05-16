// js/app.js

// Importa tudo que é necessário de outros módulos
import { MESSAGES, API_LIMIT_PER_PAGE, MAX_PAGES_CONSULTATION, CHECKBOX_CONVERT_TO_MP3_ID, LOCAL_STORAGE_KEY } from './constants.js';
// Importa funções de domUtils
import {
    getElement,
    getChamadasTableBody,
    getBaixarLoteBtn,
    getConsultarBtn,
    showStatusLoading,
    showStatusSuccess,
    showStatusError,
    showStatusWarning,
    clearStatus,
    disableConsultarBtn,
    enableConsultarBtn,
    disableBaixarLoteBtn,
    enableBaixarLoteBtn,
    showBaixarLoteBtn,
    hideBaixarLoteBtn,
    getStatusMessageArea
} from './domUtils.js';
import { salvarConfiguracoes, carregarConfiguracoes } from './storageUtils.js';
import { isValidDateTimeFormat, isValidUrlBase } from './validationUtils.js';

// Importa a função para download em lote do backend
import { fetchBackendZip } from './backendApi.js';
// Importa a função para salvar o arquivo (será usada tanto para lote quanto individual)
import { saveBlobAsFile } from './fileUtils.js';
// Importa a função de consulta da API Widevoice
import { fetchConsultationPage } from './widevoiceApi.js';


// --- Constante para o novo endpoint de download individual no backend ---\
const BACKEND_DOWNLOAD_SINGLE_URL = 'http://localhost:3000/download-single'; // Ajuste a porta se necessário

// --- Variáveis de Estado ---\
let allResults = []; // Armazena TODOS os resultados da consulta bruta da API
// A PAGINAÇÃO VAI USAR urlsGravacoesEncontradas
let urlsGravacoesEncontradas = []; // Armazena objetos { datahora, src, dst, duration, url, nomeoperador, ramal } APENAS para itens COM gravação
let currentPage = 1;
const resultsPerPage = 20; // Quantidade de gravações por página na tabela

// --- Funções de Acesso a Elementos DOM para Paginação (Definidas AQUI) ---
const getPaginationControls = () => getElement('paginationControls');
const getPrevPageBtn = () => getElement('prevPageBtn'); // Definido aqui, usa getElement
const getNextPageBtn = () => getElement('nextPageBtn'); // Definido aqui, usa getElement
const getPageInfoSpan = () => getElement('pageInfo');


// --- Funções de Manipulação da Paginação ---
const showPaginationControls = () => {
    const controls = getPaginationControls();
    if (controls) controls.style.display = 'flex'; // Usa flex para centralizar
};
const hidePaginationControls = () => {
    const controls = getPaginationControls();
    if (controls) controls.style.display = 'none';
};
const updatePageInfo = (current, total) => {
    const pageInfoSpan = getPageInfoSpan();
    // Exibe 0 de 0 se o total for 0
    if (pageInfoSpan) pageInfoSpan.textContent = `Página ${total === 0 ? 0 : current} de ${total}`;
};

// Funções para habilitar/desabilitar botões de paginação usando as funções definidas AQUI
const enablePrevPageBtn = () => { const btn = getPrevPageBtn(); if(btn) btn.disabled = false; };
const disablePrevPageBtn = () => { const btn = getPrevPageBtn(); if(btn) btn.disabled = true; };
const enableNextPageBtn = () => { const btn = getNextPageBtn(); if(btn) btn.disabled = false; };
const disableNextPageBtn = () => { const btn = getNextPageBtn(); if(btn) btn.disabled = true; };

// Função para atualizar o estado dos botões de paginação (habilitado/desabilitado)
// SE BASEIA EM GRAVAÇÕES ENCONTRADAS
function updatePaginationButtons() {
    const totalPages = Math.ceil(urlsGravacoesEncontradas.length / resultsPerPage); // Baseado em gravações

    const prevBtn = getPrevPageBtn(); // Usa a função definida AQUI
    const nextBtn = getNextPageBtn(); // Usa a função definida AQUI

    if (prevBtn) prevBtn.disabled = currentPage === 1 || totalPages === 0;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages || totalPages === 0;

    // Atualiza o texto da página também
    updatePageInfo(currentPage, totalPages);
}


// --- Funções de Manipulação do Formulário e Botões ---

export function limparCampos() {
    const urlBaseInput = getElement('url_base');
    const loginInput = getElement('login');
    const tokenInput = getElement('token');
    const datainicioInput = getElement('datainicio');
    const datafimInput = getElement('datafim');
    const chamadasTableBody = getChamadasTableBody();
    const convertCheckbox = getElement(CHECKBOX_CONVERT_TO_MP3_ID); // Obtém o checkbox

    if (urlBaseInput) urlBaseInput.value = '';
    if (loginInput) loginInput.value = '';
    if (tokenInput) tokenInput.value = '';
    if (datainicioInput) datainicioInput.value = '';
    if (datafimInput) datafimInput.value = ''; // CORRIGIDO: Estava limpando datainicio duas vezes.
    if (convertCheckbox) convertCheckbox.checked = false; // Desmarca o checkbox

    if (chamadasTableBody) chamadasTableBody.innerHTML = '';
    clearStatus();
    allResults = []; // Limpa todos os resultados brutos
    urlsGravacoesEncontradas = []; // Limpa a lista para download (e para exibição paginada)

    hideBaixarLoteBtn();
    enableConsultarBtn();
    hidePaginationControls(); // Esconde controles de paginação
    currentPage = 1; // Reseta a página atual

    // Garante que os botões de paginação e o de baixar lote estejam desabilitados ao limpar
    updatePaginationButtons(); // Reseta a info da página para 0 de 0 e desabilita botões
    disableBaixarLoteBtn(); // Garante que esteja desabilitado


    // Remove as configurações salvas
    try {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        console.log('Configurações removidas do localStorage.');
    } catch (e) {
        console.error('Erro ao remover configurações do localStorage:', e);
    }

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

    // Remove http(s):// se estiver presente para validação e uso na URL da gravação
    const cleanUserUrl = user_url.replace(/^https?:\/\//, '');
    if (!isValidUrlBase(cleanUserUrl)) {
        showStatusWarning(MESSAGES.INVALID_URL_BASE);
        return null;
    }


    // Converte datetime-local format (YYYY-MM-DDTHH:mm) para API format (YYYY-MM-DD HH:mm:ss) e para objeto Date
    const datainicioApi = datainicioLocal.replace('T', ' ') + ':00';
    const datafimApi = datafimLocal.replace('T', ' ') + ':00';

    // Valida o formato da API formatada, pois isValidDateTimeFormat espera 'YYYY-MM-DD HH:mm:ss'
    if (!isValidDateTimeFormat(datainicioApi)) {
        showStatusError(MESSAGES.INTERNAL_DATE_FORMAT_ERROR.replace('Data.', 'Data Início.'));
        console.error("Erro de formato na data de início:", datainicioLocal);
        return null;
    }
    if (!isValidDateTimeFormat(datafimApi)) {
        showStatusError(MESSAGES.INTERNAL_DATE_FORMAT_ERROR.replace('Data.', 'Data Fim.'));
        console.error("Erro de formato na data de fim:", datafimLocal);
        return null;
    }

    // Cria objetos Date para validação de intervalo
    const dateInicioObj = new Date(datainicioLocal);
    const dateFimObj = new Date(datafimLocal);

    // Verifica se os objetos Date são válidos
    if (isNaN(dateInicioObj.getTime()) || isNaN(dateFimObj.getTime())) {
        showStatusError(MESSAGES.INTERNAL_DATE_FORMAT_ERROR + " Erro ao processar datas selecionadas.");
        console.error("Datas inválidas após conversão:", datainicioLocal, datafimLocal);
        return null;
    }


    if (dateFimObj < dateInicioObj) {
        showStatusWarning(MESSAGES.DATE_RANGE_ERROR);
        return null;
    }

    return { login, token, datainicioApi, datafimApi, cleanUserUrl, dateInicioObj, dateFimObj };
}


// --- Funções de Exibição de Resultados ---

// Esta função AGORA recebe APENAS os dados da página que JÁ FORAM FILTRADOS para ter gravação
// e já contêm todos os campos necessários (datahora, src, dst, duration, url, nomeoperador, ramal)
function displayResultsPage(dadosPaginaFiltrada) {
    const chamadasTableBody = getChamadasTableBody();

    if (!chamadasTableBody) {
        console.error("Elemento #chamadasTable tbody não encontrado!");
        // Mesmo sem tabela, os controles de paginação devem refletir o total
        updatePaginationButtons(); // Garante que a info da página esteja 0 de 0
        return;
    }

    // Limpa o conteúdo atual da tabela
    chamadasTableBody.innerHTML = '';

    if (!Array.isArray(dadosPaginaFiltrada) || dadosPaginaFiltrada.length === 0) {
        console.log('A página atual não contém gravações para exibir na tabela.');
        // Mesmo que a página esteja vazia, os controles de paginação devem refletir o total
        updatePaginationButtons(); // Garante que a info da página esteja correta
        return;
    }

    dadosPaginaFiltrada.forEach(item => {
        const row = document.createElement('tr');

        // --- Criação e Adição das Células na NOVA ORDEM ---

        // Célula: Ramal (PRIMEIRO)
        const ramalCell = document.createElement('td');
        // Verifica se item.ramal existe e não é null/undefined, caso contrário usa N/A
        ramalCell.textContent = (item.ramal !== null && item.ramal !== undefined) ? item.ramal : 'N/A';
        ramalCell.setAttribute('data-label', 'Ramal'); // Para visualização mobile
        row.appendChild(ramalCell);

        // Célula: Nome Operador (SEGUNDO)
        const nomeOperadorCell = document.createElement('td');
        // Verifica se item.nomeoperador existe e não é null/undefined, caso contrário usa N/A
        nomeOperadorCell.textContent = (item.nomeoperador !== null && item.nomeoperador !== undefined) ? item.nomeoperador : 'N/A';
        nomeOperadorCell.setAttribute('data-label', 'Nome Operador'); // Para visualização mobile
        row.appendChild(nomeOperadorCell);


        // Célula: Data/Hora (TERCEIRO)
        const dateTimeCell = document.createElement('td');
        dateTimeCell.textContent = item.datahora || 'N/A';
        dateTimeCell.setAttribute('data-label', 'Data/Hora'); // Para visualização mobile
        row.appendChild(dateTimeCell);

        // Célula: Origem (QUARTO)
        const origemCell = document.createElement('td');
        origemCell.textContent = item.src || 'N/A'; // Usa o campo src já calculado
        origemCell.setAttribute('data-label', 'Origem'); // Para visualização mobile
        row.appendChild(origemCell);

        // Célula: Destino (QUINTO)
        const destinoCell = document.createElement('td');
        destinoCell.textContent = item.dst || 'N/A'; // Usa o campo dst já calculado
        destinoCell.setAttribute('data-label', 'Destino'); // Para visualização mobile
        row.appendChild(destinoCell);

        // Célula: Duração (SEXTO)
        const duracaoCell = document.createElement('td');
        // Formata Duração (já vem bruta no objeto)
        const duracaoNumericaDoItem = parseInt(item.duration, 10);
        const duracaoFormatadaDoItem = !isNaN(duracaoNumericaDoItem) && duracaoNumericaDoItem >= 0 ? `${duracaoNumericaDoItem}s` : 'N/A';
        duracaoCell.textContent = duracaoFormatadaDoItem; // Usa a duração formatada
        duracaoCell.setAttribute('data-label', 'Duração (s)'); // Ajustado label para (s)
        row.appendChild(duracaoCell);

        // Célula: Gravação (Download) (SÉTIMO/ÚLTIMO) - COM EVENT LISTENER DELEGADO
        const gravacaoCell = document.createElement('td');
        gravacaoCell.setAttribute('data-label', 'Gravação'); // Para visualização mobile

        // A URL já está completa e validada na lista (item.url)
        const urlGravacao = item.url || '#';

        if (urlGravacao !== '#') {
            const downloadLink = document.createElement('a');
            // O href não precisa ser a URL real, o event listener vai usar o data attribute
            downloadLink.href = '#';
            downloadLink.textContent = MESSAGES.TEXT_BAIXAR_GRAVACAO; // Texto do link
            downloadLink.title = 'Baixar gravação individual';
            downloadLink.style.cursor = 'pointer'; // Indica que é clicável
            downloadLink.classList.add('download-link'); // Adiciona classe para delegação de eventos

            // Armazena a URL da gravação em um atributo data
            downloadLink.dataset.recordingUrl = urlGravacao;
            // Opcional: armazenar outros dados úteis para o log no backend, se necessário
            // downloadLink.dataset.origem = item.src;
            // downloadLink.dataset.destino = item.dst;
            // downloadLink.dataset.datahora = item.datahora;
            // downloadLink.dataset.nomeoperador = item.nomeoperador;
            // downloadLink.dataset.ramal = item.ramal;


            const downloadIcon = document.createElement('i');
            downloadIcon.classList.add('fas', 'fa-download');
            downloadLink.prepend(downloadIcon); // Adiciona o ícone antes do texto

            gravacaoCell.appendChild(downloadLink);
        } else {
            // Caso não tenha URL de gravação (embora a lista urlsGravacoesEncontradas deva ter apenas com URL)
            // Mantido por segurança ou para futuros ajustes de filtro
            gravacaoCell.innerHTML = '<em>Sem gravação</em>';
            gravacaoCell.classList.add('disabled-link'); // Adiciona classe para estilização
        }
        row.appendChild(gravacaoCell);

        chamadasTableBody.appendChild(row);
    });

    // Atualiza os botões de paginação após exibir a página
    updatePaginationButtons();
}


// --- Funções de Consulta API (fatiamento temporal) ---

// Função auxiliar para buscar dados da API Widevoice usando intervalo de datas
// Implementa a lógica de fatiamento temporal.
// Esta função é uma helper INTERNA de consultarChamadas.
async function fetchWidevoiceDataByDateRange(urlBase, login, token, currentSearchStartApi, currentSearchEndApi, page) {
    // Usa a função importada do módulo widevoiceApi para buscar uma página
    // Passa os parâmetros corretos para fetchConsultationPage
    const pageData = await fetchConsultationPage(urlBase, login, token, currentSearchStartApi, currentSearchEndApi, 0, API_LIMIT_PER_PAGE, page);

    // fetchConsultationPage já lida com erros HTTP e validação básica do retorno (array)
    // Retorna o array de resultados para esta faixa
    return pageData;
}


export async function consultarChamadas() {
    // Gerencia o estado dos botões e status no início
    disableConsultarBtn();
    disableBaixarLoteBtn(); // Desabilita o botão de download em lote
    hideBaixarLoteBtn(); // Esconde o botão de download em lote durante a consulta
    clearStatus();
    hidePaginationControls(); // Esconde controles de paginação
    const chamadasTableBody = getChamadasTableBody();
    if (chamadasTableBody) chamadasTableBody.innerHTML = ''; // Limpa a tabela

    allResults = []; // Zera todos os resultados brutos armazenados
    urlsGravacoesEncontradas = []; // Zera a lista para download (e para exibição paginada)
    currentPage = 1; // Reseta a página atual


    const formData = getAndValidateFormData();
    if (!formData) {
        enableConsultarBtn();
        disableBaixarLoteBtn(); // Garante que esteja desabilitado
        // clearStatus() já foi chamado em getAndValidateFormData
        return;
    }

    showStatusLoading(MESSAGES.LOADING + ' (Iniciando busca por fatiamento temporal...)');
    salvarConfiguracoes();

    let page = 1; // Usado para feedback e log, representando cada tentativa/faixa de busca.
    // Variável para controlar o início do próximo intervalo de busca (começa com o datainicio original)
    let currentSearchStart = new Date(formData.dateInicioObj); // Começa com o objeto Date original
    const originalSearchEnd = new Date(formData.dateFimObj); // Mantém o objeto Date original de fim

    // Calcula a diferença total em segundos entre a data fim original e a data início original
    const totalSecondsRange = Math.floor((originalSearchEnd.getTime() - currentSearchStart.getTime()) / 1000);
    console.log(`Intervalo total de consulta em segundos: ${totalSecondsRange}`);


    try {
        // Loop de busca baseado em data/hora. Continua enquanto o início da busca atual for menor ou igual ao fim original.
        while (currentSearchStart <= originalSearchEnd) {

            // Verifica se o limite máximo de páginas foi atingido como salvaguarda
            if (page > MAX_PAGES_CONSULTATION) {
                console.warn(`Limite máximo de páginas (${MAX_PAGES_CONSULTATION}) atingido. Interrompendo a busca.`);
                showStatusWarning(`${MESSAGES.LOADING} Limite máximo de páginas (${MAX_PAGES_CONSULTATION}) atingido. A busca pode estar incompleta.`);
                // Não quebra o loop imediatamente, permite processar a última requisição,
                // mas a mensagem de limite atingido será exibida.
            }

            // Converte o início da busca atual (Date object) para o formato da API (YYYY-MM-DD HH:mm:ss)
            // E garante que não exceda a datafim original.
            // Adicionado padStart para garantir 2 dígitos para mês/dia/hora/minuto/segundo
            const startApiFormatted = `${currentSearchStart.getFullYear()}-${String(currentSearchStart.getMonth() + 1).padStart(2, '0')}-${String(currentSearchStart.getDate()).padStart(2, '0')} ${String(currentSearchStart.getHours()).padStart(2, '0')}:${String(currentSearchStart.getMinutes()).padStart(2, '0')}:${String(currentSearchStart.getSeconds()).padStart(2, '0')}`;

            // A data/hora final da requisição É SEMPRE a datafim original da consulta.
            const endApiFormatted = formData.datafimApi;


            // Atualiza o feedback de carregamento para a faixa de data/hora atual
            showStatusLoading(`${MESSAGES.LOADING} (Buscando faixa ${startApiFormatted} até ${endApiFormatted} - tentativa ${page}, Total de resultados brutos atuais: ${allResults.length})...`);


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

            // Se a API retornou um array vazio (ou null tratado como vazio) para este intervalo.
            if (!data || data.length === 0) { // Verifica se data é null ou vazio
                console.log(`API retornou 0 resultados para faixa ${startApiFormatted} a ${endApiFormatted}.`);

                // Se não retornou dados, avança o currentSearchStart para garantir que o loop eventualmente pare
                // Isso é importante se a API retornar 0 resultados para um intervalo no meio.
                // Avançamos para 1 segundo após a data de fim da *requisição* atual,
                // ou para a data fim original + 1s se a data fim da requisição já for a original.
                const currentRequestEndObj = new Date(endApiFormatted.replace(' ', 'T')); // Objeto Date do fim da requisição atual
                if (currentRequestEndObj.getTime() >= originalSearchEnd.getTime()) {
                    // Se o fim da requisição atual já é ou passou o fim original, avança al ém do fim original
                    currentSearchStart = new Date(originalSearchEnd.getTime() + 1000);
                    console.log(`Fim da requisição ${endApiFormatted} >= fim original ${formData.datafimApi}. Avançando início da busca além do fim original.`);
                } else {
                    // Se o fim da requisição atual ainda é antes do fim original, avança 1s após o fim da requisição atual
                    currentSearchStart = new Date(currentRequestEndObj.getTime() + 1000);
                    console.log(`Fim da requisição ${endApiFormatted} < fim original ${formData.datafimApi}. Avançando início da busca para 1s após fim da requisição atual.`);
                }

                page++; // Incrementa a página/tentativa mesmo sem resultados
                //await new Promise(resolve => setTimeout(resolve, 50)); // Pequena pausa
                continue; // Continua o loop para verificar a próxima faixa (se ainda estiver dentro do período original)

            }


            // Se chegou até aqui, a API retornou dados (data.length > 0). Adiciona esses resultados aos resultados totais brutos.
            allResults = allResults.concat(data);
            console.log(`Faixa ${startApiFormatted} a ${endApiFormatted} retornou ${data.length} resultados. Total bruto acumulado: ${allResults.length}`);


            // Se a quantidade de resultados retornados é menor que o limite da API, significa que esta é a última página com dados
            // NESTA faixa temporal. Podemos assumir o fim da busca GERAL se a data do último registro for >= datafim original.
            if (data.length < API_LIMIT_PER_PAGE) {
                console.log(`API retornou ${data.length} resultados (< ${API_LIMIT_PER_PAGE}) para faixa ${startApiFormatted} a ${endApiFormatted}. Verificando data do último registro.`);

                // Verifica se a data/hora do último registro nesta faixa é >= à datafim original
                try {
                    // Encontra o registro mais recente na lista atual (data)
                    const latestRecord = data.reduce((latest, current) => {
                        if (!latest || (current.datahora && current.datahora > latest.datahora)) {
                            return current;
                        }
                        return latest;
                    }, null);

                    const latestDatahoraStr = latestRecord?.datahora;

                    if (latestDatahoraStr) {
                        const latestDate = new Date(latestDatahoraStr.replace(' ', 'T'));

                        // Verifica se a data é válida antes de comparar
                        if (!isNaN(latestDate.getTime())) {
                            if (latestDate.getTime() >= originalSearchEnd.getTime()) {
                                console.log(`Data do último registro (${latestDatahoraStr}) é >= à data fim original. Parando a busca.`);
                                // Avança o currentSearchStart para garantir que a condição do while seja falsa
                                currentSearchStart = new Date(originalSearchEnd.getTime() + 1000);
                                break; // Sai do loop principal de fatiamento
                            } else {
                                // Se retornou < API_LIMIT_PER_PAGE, mas o último registro AINDA está antes do fim original,
                                // significa que esta faixa temporal foi completamente consumida, mas ainda há tempo restante no intervalo original.
                                // Avança o início da próxima busca para 1 segundo após o final DESSA faixa (endApiFormatted)
                                // e continua o loop para buscar no restante do período.
                                console.log(`Data do último registro (${latestDatahoraStr}) é < à data fim original. Avançando o início da busca para 1s após o fim da *requisição* atual.`);
                                const currentRequestEndObj = new Date(endApiFormatted.replace(' ', 'T'));
                                currentSearchStart = new Date(currentRequestEndObj.getTime() + 1000);
                                page++;
                                await new Promise(resolve => setTimeout(resolve, 50)); // Pequena pausa
                                continue; // Continua para a próxima iteração do loop
                            }
                        } else {
                            // Se a data do último registro é inválida, mas retornou < API_LIMIT_PER_PAGE,
                            // tratamos como se o fim da faixa tivesse sido atingido.
                            console.warn(`Data do último registro ('${latestDatahoraStr}') inválida. Retornou ${data.length} < ${API_LIMIT_PER_PAGE}. Avançando o início da busca para 1s após o fim da *requisição* atual.`);
                            const currentRequestEndObj = new Date(endApiFormatted.replace(' ', 'T'));
                            currentSearchStart = new Date(currentRequestEndObj.getTime() + 1000);
                            page++;
                            await new Promise(resolve => setTimeout(resolve, 50)); // Pequena pausa
                            continue; // Continua
                        }

                    } else {
                        // Se retornou < API_LIMIT_PER_PAGE mas não encontrou 'datahora' no último registro,
                        // é um caso inesperado, loga um aviso e avança como se tivesse chegado ao fim da faixa.
                        console.warn(`API retornou ${data.length} resultados (< ${API_LIMIT_PER_PAGE}) mas nenhum registro tem 'datahora'. Avançando o início da busca para 1s após o fim da *requisição* atual.`);
                        const currentRequestEndObj = new Date(endApiFormatted.replace(' ', 'T'));
                        currentSearchStart = new Date(currentRequestEndObj.getTime() + 1000);
                        page++;
                        await new Promise(resolve => setTimeout(resolve, 50)); // Pequena pausa
                        continue; // Continua
                    }


                } catch (dateError) {
                    console.error(`Erro ao processar data do último registro para verificar fim da busca na tentativa ${page}: ${dateError.message}`, dateError);
                    // showStatusError(`❌ Erro interno ao verificar data do último registro. Busca pode estar incompleta.`); // Evitar poluir status
                    // Mesmo com erro, avança o início da busca para tentar processar as próximas faixas se houver
                    const currentRequestEndObj = new Date(endApiFormatted.replace(' ', 'T'));
                    currentSearchStart = new Date(currentRequestEndObj.getTime() + 1000);
                    page++;
                    await new Promise(resolve => setTimeout(resolve, 50)); // Pequena pausa
                    continue;
                }
            }

            // Se o loop não parou (data.length === API_LIMIT_PER_PAGE) E a data do último registro < datafim original,
            // significa que há API_LIMIT_PER_PAGE resultados NESTA faixa temporal e provavelmente há mais dados
            // após esta faixa, DENTRO do intervalo original.
            // Precisamos encontrar a data/hora mais recente entre os resultados RETORNADOS NESTA REQUISIÇÃO
            // e definir o início da próxima busca para 1 segundo após essa data/hora.
            // Esta lógica só é executada se data.length === API_LIMIT_PER_PAGE E o loop não parou pelas condições anteriores.
            try {
                const latestRecord = data.reduce((latest, current) => {
                    if (!latest || (current.datahora && current.datahora > latest.datahora)) {
                        return current;
                    }
                    return latest;
                }, null);

                const latestDatahoraStr = latestRecord?.datahora;

                if (!latestDatahoraStr) {
                    console.warn(`API retornou ${API_LIMIT_PER_PAGE} resultados, mas o último registro não tem 'datahora' válida. Avançando o início da próxima busca para 1s após o final desta faixa (requisição atual).`);
                    // Em um caso excepcional onde API_LIMIT_PER_PAGE resultados são retornados, mas o último não tem datahora,
                    // avançamos o início da próxima busca para 1s após o fim da *requisição* atual como fallback.
                    const currentRequestEndObj = new Date(endApiFormatted.replace(' ', 'T'));
                    currentSearchStart = new Date(currentRequestEndObj.getTime() + 1000);

                } else {
                    const latestDate = new Date(latestDatahoraStr.replace(' ', 'T'));

                    if (isNaN(latestDate.getTime())) {
                        console.warn(`API retornou ${API_LIMIT_PER_PAGE} resultados, mas a 'datahora' ('${latestDatahoraStr}') do último registro é inválida. Avançando o início da próxima busca para 1s após o final desta faixa (requisição atual).`);
                        // Fallback se a data do último registro for inválida
                        const currentRequestEndObj = new Date(endApiFormatted.replace(' ', 'T'));
                        currentSearchStart = new Date(currentRequestEndObj.getTime() + 1000);
                    } else {
                        // Define o início da próxima busca como 1 segundo após a data/hora do registro mais recente
                        currentSearchStart = new Date(latestDate.getTime() + 1000);
                        console.log(`Faixa retornou ${API_LIMIT_PER_PAGE} resultados. Próxima busca inicia em ${currentSearchStart.toLocaleString()}.`);
                    }
                }

            } catch (dateError) {
                console.error(`Erro ao determinar o início da próxima faixa de busca na tentativa ${page}: ${dateError.message}`, dateError);
                showStatusError(`❌ Erro interno ao processar data do último registro na tentativa ${page}: ${dateError.message}. Busca interrompida.`);
                break; // Aborta a busca em caso de erro fatal
            }

            // Pequena pausa entre as requisições para não sobrecarregar a API
            await new Promise(resolve => setTimeout(resolve, 50));

            // Incrementa a página/tentativa de busca para o feedback
            page++;


        } // Fim do loop while (currentSearchStart <= originalSearchEnd)


        // --- Processamento final após obter TODOS os resultados brutos ---

        // ** AGORA: Filtra TODOS os resultados brutos para pegar APENAS aqueles com gravação **
        // ** E popula a lista urlsGravacoesEncontradas COM OBJETOS MAIS COMPLETOS para exibição **
        urlsGravacoesEncontradas = allResults
            .filter(chamada => chamada.gravacao && typeof chamada.gravacao === 'string' && chamada.gravacao.trim() !== '') // Filtra APENAS quem tem gravação
            .map(chamada => {
                // Constroi o objeto para exibição E download com todos os campos necessários
                const caminho = chamada.gravacao.replaceAll("\\/", "/");
                // Tenta usar recording_url primeiro se existir, senão constrói a URL com base no caminho
                // CORRIGIDO: Verifica se user_url existe antes de construir a URL
                const urlGravacao = chamada.recording_url && typeof chamada.recording_url === 'string' && chamada.recording_url.trim() !== ''
                    ? chamada.recording_url.trim()
                    : (caminho && formData.cleanUserUrl ? `https://${formData.cleanUserUrl}/gravador28/${caminho}.gsm` : '#');


                // Determina Origem e Destino para armazenar no objeto (lógica existente)
                let origem = 'N/A';
                let destino = 'N/A';
                if (chamada.chamada === 'E') { // Chamada de Entrada
                    origem = chamada.call_entrada || 'N/A';
                    destino = chamada.numero || chamada.ramal || 'N/A';
                } else if (chamada.chamada === 'S') { // Chamada de Saída
                    origem = chamada.ramal || chamada.numero || 'N/A';
                    destino = chamada.numero || chamada.call_entrada || 'N/A';
                } else {
                    origem = chamada.ramal || chamada.numero || chamada.call_entrada || 'N/A';
                    destino = 'N/A';
                }

                return {
                    // Inclui todos os campos necessários para exibição E download
                    // REMOVIDO: numero: chamada.numero, // Remove o campo número
                    datahora: chamada.datahora,
                    src: origem, // Adiciona origem calculada
                    dst: destino, // Adiciona destino calculado
                    duration: chamada.duracao, // Adiciona duração bruta
                    url: urlGravacao, // Adiciona a URL da gravação (validada)
                    nomeoperador: chamada.nomeoperador, // Inclui nomeoperador
                    ramal: chamada.ramal // Inclui ramal
                };
            })
            // Filtra novamente para garantir que APENAS itens com uma URL de gravação válida no campo 'url' vão para a lista final
            .filter(item => item.url && typeof item.url === 'string' && item.url !== '#' && item.url.trim() !== '');


        // Exibe os resultados da PRIMEIRA página dos ITENS COM GRAVAÇÃO
        // A função displayResultsPage recebe APENAS os dados da página a ser exibida (que já são os itens com gravação)
        displayResultsPage(urlsGravacoesEncontradas.slice(0, resultsPerPage)); // Exibe a primeira página


        // Gerencia o botão de baixar em lote e a mensagem final de status
        const numGravacoesEncontradas = urlsGravacoesEncontradas.length;
        const totalResultadosBrutos = allResults.length;

        if (numGravacoesEncontradas > 0) {
            showBaixarLoteBtn();
            // Exibe status de sucesso informando quantas gravações foram encontradas
            const statusArea = getStatusMessageArea();
            // Verifica se a mensagem de limite máximo JÁ FOI exibida
            const limitWarningAlreadyShown = statusArea?.classList.contains('warning') && (statusArea?.textContent || '').includes('Limite máximo de páginas');


            if (!limitWarningAlreadyShown) {
                showStatusSuccess(`${MESSAGES.FINAL_RESULTS_DISPLAY(totalResultadosBrutos)}. ${numGravacoesEncontradas} gravação(ões) encontrada(s).`);
            } else {
                // Se o limite máximo foi atingido, mantém a mensagem de aviso e adiciona a contagem de gravações
                const currentStatusText = statusArea?.textContent || '';
                // Garante que a contagem não seja duplicada
                if (!currentStatusText.includes(`${numGravacoesEncontradas} gravação(ões) encontrada(s)`)) {
                    statusArea.textContent = `${currentStatusText.trim()} ${numGravacoesEncontradas} gravação(ões) encontrada(s).`;
                    // Mantém a classe de aviso se o limite foi atingido
                    // statusArea.classList.add('warning'); // Já deve ter a classe 'warning' se a mensagem de limite foi exibida
                }
            }

        } else if (totalResultadosBrutos > 0 && numGravacoesEncontradas === 0) {
            // Se encontrou resultados brutos, mas NENHUM com gravação
            hideBaixarLoteBtn();
            showStatusWarning(MESSAGES.NO_RECORDINGS_FOUND_FILTERED + ` (Total de resultados brutos: ${totalResultadosBrutos})`);

        } else {
            // Se não encontrou resultados brutos NENHUM (allResults.length === 0)
            hideBaixarLoteBtn();
            showStatusWarning(MESSAGES.NO_RESULTS); // Nenhum resultado encontrado no período
        }


    } catch (erro) {
        // Lidar com quaisquer erros que ocorreram durante as requisições (HTTP fetch, array inválido, etc.)
        handleApiError(erro); // Usa a função centralizada para exibir o erro

    } finally {
        // Garante que o botão Consultar seja reabilitado
        enableConsultarBtn();
        // Garante que o botão de download em lote seja reabilitado (visibilidade já tratada)
        if (urlsGravacoesEncontradas.length > 0) {
            enableBaixarLoteBtn();
            showBaixarLoteBtn(); // Garante que esteja visível se houver gravações
        } else {
            disableBaixarLoteBtn();
            hideBaixarLoteBtn(); // Garante que esteja oculto se não houver gravações
        }


        // Se houver gravações para exibir, mostra os controles de paginação
        // A paginação agora se baseia em urlsGravacoesEncontradas
        if (urlsGravacoesEncontradas.length > 0) {
            showPaginationControls();
            // A função updatePaginationButtons já é chamada dentro de displayResultsPage
            // que é chamada por showPage e também no final deste bloco finally
        } else {
            // Se não há gravações, esconde os controles de paginação
            hidePaginationControls();
            // updatePaginationButtons() já reseta a info da página para 0 de 0
        }
        // Garante que o botão baixar lote esteja desabilitado se não houver gravações
        if (urlsGravacoesEncontradas.length === 0) {
            disableBaixarLoteBtn();
        }
    }
}


// --- Funções de Paginação no Frontend (BASEADO EM GRAVAÇÕES ENCONTRADAS) ---

// Função para exibir uma página específica de resultados (agora, de gravações encontradas)
function showPage(page) {
    // Validação básica para garantir que a página é válida
    const totalPages = Math.ceil(urlsGravacoesEncontradas.length / resultsPerPage);
    if (page < 1 || (page > totalPages && totalPages > 0)) { // Adicionado verificação totalPages > 0
        console.warn(`Tentativa de exibir página inválida: ${page}. Total de páginas: ${totalPages}.`);
        // Redirecionar para a primeira ou última página válida
        page = totalPages > 0 ? totalPages : 1;
        // currentPage será atualizada logo após o slice e antes de displayResultsPage
    }


    const startIndex = (page - 1) * resultsPerPage;
    // O endIndex não precisa ser ajustado, slice lida com o fim do array
    const endIndex = startIndex + resultsPerPage;
    // FATIA urlsGravacoesEncontradas para a página atual
    const paginatedResults = urlsGravacoesEncontradas.slice(startIndex, endIndex);

    // Atualiza a variável de estado da página atual ANTES de exibir
    currentPage = page;

    // Exibe apenas os resultados da página atual (que já são os itens com gravação)
    displayResultsPage(paginatedResults); // Chama a função de exibição da página

    // A função updatePaginationButtons já é chamada dentro de displayResultsPage para garantir que o estado dos botões corresponda
}


// Função para ir para a página anterior
function goToPreviousPage() {
    if (currentPage > 1) {
        showPage(currentPage - 1);
    }
}

// Função para ir para a próxima página
function goToNextPage() {
    const totalPages = Math.ceil(urlsGravacoesEncontradas.length / resultsPerPage);
    if (currentPage < totalPages) {
        showPage(currentPage + 1);
    }
}


// --- Funções de Exibir Erros ---
function handleApiError(erro) {
    // Elementos já obtidos via getElement/getChamadasTableBody
    const consultarBtn = getConsultarBtn();
    const baixarLoteBtn = getBaixarLoteBtn();
    const chamadasTableBody = getChamadasTableBody();

    console.error('Erro na consulta:', erro);
    showStatusError(erro.message || 'Ocorreu um erro desconhecido durante a consulta.');

    if (chamadasTableBody) chamadasTableBody.innerHTML = '';

    allResults = []; // Limpa resultados brutos em caso de erro
    urlsGravacoesEncontradas = []; // Limpa lista de download/exibição

    hidePaginationControls(); // Esconde controles de paginação
    currentPage = 1; // Reseta a página

    if (consultarBtn) enableConsultarBtn(); // Reabilita o botão Consultar
    // Desabilita o botão de baixar lote em caso de erro
    disableBaixarLoteBtn();
    hideBaixarLoteBtn(); // Garante que esteja oculto

    updatePaginationButtons(); // Garante que a info da página esteja 0 de 0 e botões desabilitados
}


// --- Funções de Download ---

// --- Função para Download INDIVIDUAL com Conversão ---
async function baixarGravacaoIndividual(recordingUrl) {
    // Elementos já obtidos via getElement/getConsultarBtn/getBaixarLoteBtn
    const consultarBtn = getConsultarBtn();
    const baixarLoteBtn = getBaixarLoteBtn();

    showStatusLoading(MESSAGES.DOWNLOAD_PROCESSING + ' (Individual)...');
    disableConsultarBtn();
    disableBaixarLoteBtn(); // Desabilita o botão de lote
    hidePaginationControls(); // Oculta paginação durante o download


    try {
        console.log(`Solicitando download individual convertido para o backend para URL: ${recordingUrl}`);
        const response = await fetch(BACKEND_DOWNLOAD_SINGLE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ recordingUrl: recordingUrl }), // Envia a URL para o backend
        });

        // --- TRATAMENTO DA RESPOSTA DO BACKEND (DOWNLOAD INDIVIDUAL) ---
        if (!response.ok) {
            console.error(`Resposta de erro do backend (individual): Status ${response.status}`);

            let errorMsg = `Status: ${response.status}`;
            try {
                const errorData = await response.json();
                console.error('Dados de erro do backend (individual):', errorData);
                if (errorData && (errorData.error || errorData.details)) {
                    errorMsg = errorData.error || errorData.details;
                }
            } catch (jsonError) {
                console.warn('Erro ao ler resposta de erro do backend (individual) como JSON, tentando como texto:', jsonError);
                try {
                    const errorText = await response.text();
                    console.error('Corpo da resposta de error como texto (individual):', errorText);
                    if (errorText) errorMsg = `Status: ${response.status}. Resposta: ${errorText}`;
                } catch (textError) {
                    // Ignora erro ao ler como texto
                }
            }
            showStatusError(`❌ Falha no download individual: ${errorMsg}`);
            return; // Sai da função após tratar o erro
        }

        // ** SE response.ok FOR TRUE (Status 200 OK) **
        // LER O CORPO DA RESPOSTA COMO BLOB (É O ARQUIVO MP3)
        console.log('Resposta do backend recebida (Status 200 OK - individual). Lendo corpo como Blob...');
        const mp3Blob = await response.blob();

        // Utiliza a função de salvar arquivo importada (que lida com FileSaver.js ou fallback)
        // Passa o blob do MP3 e os cabeçalhos da resposta do backend (para o nome do arquivo)
        saveBlobAsFile(mp3Blob, response.headers);

        // Feedback de sucesso é dado DENTRO de saveBlobAsFile

    } catch (error) {
        console.error('Erro na comunicação com o backend ou processamento/exibição do erro no frontend (individual):', error);
        showStatusError(`❌ Erro no download individual: ${error.message}`);

    } finally {
        // Reabilita os botões ao final
        enableConsultarBtn();
        // Reabilita o botão de baixar lote apenas se houver gravações na lista filtrada
        if (urlsGravacoesEncontradas.length > 0) {
            enableBaixarLoteBtn();
            showBaixarLoteBtn(); // Garante que esteja visível
        } else {
            disableBaixarLoteBtn();
            hideBaixarLoteBtn(); // Garante que esteja oculto
        }

        // Reexibe os controles de paginação se houver GRAVAÇÕES para exibir
        if (urlsGravacoesEncontradas.length > 0) {
            showPaginationControls();
            updatePaginationButtons(); // Atualiza estado dos botões
        }
    }
}


// --- Função principal do botão de download em lote ---
export async function baixarGravacoesEmLote() {
    // Esta função já usa urlsGravacoesEncontradas
    const numGravacoes = urlsGravacoesEncontradas.length;

    if (numGravacoes === 0) {
        showStatusWarning(MESSAGES.NO_RECORDINGS_TO_DOWNLOAD); // Use showStatusWarning para mensagens não críticas
        return;
    }

    // Move a desabilitação inicial dos botões para ANTES do confirm
    disableConsultarBtn();
    disableBaixarLoteBtn();
    hidePaginationControls(); // Oculta paginação

    const confirmarDownload = confirm(MESSAGES.DOWNLOAD_CONFIRM(numGravacoes));

    if (!confirmarDownload) {
        showStatusWarning(MESSAGES.DOWNLOAD_CANCELLED);
        // Reabilita botões e reexibe paginação APÓS o cancelamento
        enableConsultarBtn();
        if (urlsGravacoesEncontradas.length > 0) {
            enableBaixarLoteBtn();
            showPaginationControls();
            updatePaginationButtons();
        } else {
            disableBaixarLoteBtn();
        }
        return; // Sai da função se cancelado
    }

    const convertCheckbox = getElement(CHECKBOX_CONVERT_TO_MP3_ID);
    const convertToMp3 = convertCheckbox ? convertCheckbox.checked : false;

    // Chama a função auxiliar que trata o fetch e o save
    fetchAndSaveZipFromBackend(urlsGravacoesEncontradas, convertToMp3);
    // O finally dentro de fetchAndSaveZipFromBackend reabilitará os botões e reexibirá a paginação
}

// --- Função auxiliar para baixar o arquivo ZIP do backend e salvar ---
async function fetchAndSaveZipFromBackend(recordingsList, convertToMp3) {
    // Elementos já obtidos via getElement/getConsultarBtn/getBaixarLoteBtn
    const baixarLoteBtn = getBaixarLoteBtn();
    const consultarBtn = getConsultarBtn();


    showStatusLoading(MESSAGES.DOWNLOAD_PROCESSING + ' (Lote)...');
    // Os botões já foram desabilitados em baixarGravacoesEmLote antes do confirm


    try {
        // Chama a função do backendApi para iniciar o download em lote
        console.log(`Solicitando download em lote (${recordingsList.length} gravações) para o backend.`);
        const response = await fetchBackendZip(recordingsList, convertToMp3);

        if (!response.ok) {
            console.error(`Resposta de erro do backend (lote): Status ${response.status}`);

            let errorMsg = `Status: ${response.status}`;
            let failedDownloadsItems = [];
            let failedConversionsItems = [];

            try {
                const errorData = await response.json();
                console.error('Dados de erro do backend (lote):', errorData);

                // Verifica se há campos de erro ou listas de falha
                if (errorData) {
                    errorMsg = errorData.error || errorData.details || `Status: ${response.status}`;
                    // Garante que as listas de falha sejam arrays
                    failedDownloadsItems = Array.isArray(errorData.failedDownloads) ? errorData.failedDownloads : [];
                    failedConversionsItems = Array.isArray(errorData.failedConversions) ? errorData.failedConversions : [];

                    // Loga falhas no console do navegador também
                    if (failedDownloadsItems.length > 0) console.error("Falhas de Download no Lote:", failedDownloadsItems);
                    if (failedConversionsItems.length > 0) console.error("Falhas de Conversão no Lote:", failedConversionsItems);
                }
            } catch (jsonError) {
                console.warn('Erro ao ler resposta de erro do backend (lote) como JSON, tentando como texto:', jsonError);
                try {
                    const errorText = await response.text();
                    console.error('Corpo da resposta de error como texto (lote):', errorText);
                    if (errorText) errorMsg = `Status: ${response.status}. Resposta: ${errorText}`;
                } catch (textError) {
                    // Ignora erro ao ler como texto
                }
            }

            // Exibe a mensagem de erro detalhada usando MESSAGES.DOWNLOAD_FAILED_DETAILS
            showStatusError(MESSAGES.DOWNLOAD_FAILED_DETAILS(errorMsg, failedDownloadsItems, failedConversionsItems));
            return; // Sai da função após tratar o erro
        }

        console.log('Resposta do backend recebida (Status 200 OK - lote). Lendo corpo como Blob...');
        const zipBlob = await response.blob();

        // O saveBlobAsFile já trata a exibição de mensagem de sucesso e usa o header Content-Disposition
        saveBlobAsFile(zipBlob, response.headers);
        // Feedback de sucesso é dado DENTRO de saveBlobAsFile

    } catch (error) {
        console.error('Erro na comunicação com o backend ou processamento/exibição do erro no frontend (lote):', error);
        showStatusError(`❌ Erro: ${error.message}`);

    } finally {
        enableConsultarBtn(); // Reabilita botões
        if (urlsGravacoesEncontradas.length > 0) {
            enableBaixarLoteBtn(); // Reabilita o botão de baixar lote apenas se houver gravações
            showBaixarLoteBtn(); // Garante que esteja visível
        } else {
            disableBaixarLoteBtn();
            hideBaixarLoteBtn(); // Garante que esteja oculto
        }

        // Reexibe os controles de paginação se houver GRAVAÇÕES para exibir
        if (urlsGravacoesEncontradas.length > 0) {
            showPaginationControls();
            updatePaginationButtons(); // Atualiza estado dos botões
        }
    }
}


// --- Event Listeners ---

// Carrega configurações ao carregar a janela
window.addEventListener('load', carregarConfiguracoes);

// Adiciona os event listeners aos botões e AGORA aos links de gravação (delegado)
document.addEventListener('DOMContentLoaded', () => {
    const consultarBtn = getConsultarBtn();
    if(consultarBtn) {
        consultarBtn.addEventListener('click', consultarChamadas);
    }

    const limparCamposBtn = getElement('limparCamposBtn');
    if(limparCamposBtn) {
        limparCamposBtn.addEventListener('click', limparCampos);
    }

    const baixarLoteBtn = getBaixarLoteBtn();
    if(baixarLoteBtn) {
        baixarLoteBtn.addEventListener('click', baixarGravacoesEmLote);
    }

    // Event listeners para paginação
    const prevPageBtn = getPrevPageBtn(); // Usa a função definida AQUI
    if(prevPageBtn) {
        prevPageBtn.addEventListener('click', goToPreviousPage);
    }

    const nextPageBtn = getNextPageBtn(); // Usa a função definida AQUI
    if(nextPageBtn) {
        nextPageBtn.addEventListener('click', goToNextPage);
    }

    // ** Delegação de Eventos para os links de Download Individual na Tabela **
    // Em vez de adicionar um listener a cada link (que mudam a cada paginação),
    // adicionamos um único listener ao corpo da tabela e verificamos se o clique
    // ocorreu em um link de download.
    const chamadasTableBody = getChamadasTableBody();
    if (chamadasTableBody) {
        chamadasTableBody.addEventListener('click', (event) => {
            const target = event.target;
            // Verifica se o elemento clicado ou um de seus ancestrais é um link de download
            const downloadLink = target.closest('.download-link');

            if (downloadLink && !downloadLink.classList.contains('disabled-link')) { // Adicionado verificação para links desabilitados
                event.preventDefault(); // Impede a ação padrão do link
                const recordingUrl = downloadLink.dataset.recordingUrl; // Obtém a URL do atributo data

                if (recordingUrl) {
                    baixarGravacaoIndividual(recordingUrl);
                } else {
                    console.error("URL de gravação não encontrada no atributo data-recording-url.");
                    showStatusError("❌ Erro: URL de gravação não disponível.");
                }
            }
        });
    }


    // Inicializa o estado dos botões de paginação
    // (eles estarão desabilitados e ocultos se urlsGravacoesEncontradas estiver vazio)
    updatePaginationButtons(); // Isso também reseta a info da página para 0 de 0

    // Garante que o botão de baixar lote comece desabilitado e oculto na carga inicial
    disableBaixarLoteBtn();
    hideBaixarLoteBtn();

    console.log("Event listeners adicionados. app.js inicializado.");
});