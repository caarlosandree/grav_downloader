// Importa tudo que é necessário de outros módulos
import { MESSAGES, API_LIMIT_PER_PAGE, MAX_PAGES_CONSULTATION, CHECKBOX_CONVERT_TO_MP3_ID } from './constants.js';
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


// --- Constante para o novo endpoint de download individual no backend ---
const BACKEND_DOWNLOAD_SINGLE_URL = 'http://localhost:3000/download-single'; // Ajuste a porta se necessário

// --- Variáveis de Estado ---
let allResults = []; // Armazena TODOS os resultados da consulta bruta da API
// AGORA A PAGINAÇÃO VAI USAR urlsGravacoesEncontradas
let urlsGravacoesEncontradas = []; // Armazena objetos { numero, datahora, src, dst, duration, url } APENAS para itens COM gravação
let currentPage = 1;
const resultsPerPage = 50;


// --- Funções de Acesso a Elementos DOM para Paginação ---
const getPaginationControls = () => getElement('paginationControls');
const getPrevPageBtn = () => getElement('prevPageBtn');
const getNextPageBtn = () => getElement('nextPageBtn');
const getPageInfoSpan = () => getElement('pageInfo');

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
    if (pageInfoSpan) pageInfoSpan.textContent = `Página ${current} de ${total}`;
};
const enablePrevPageBtn = () => { const btn = getPrevPageBtn(); if(btn) btn.disabled = false; };
const disablePrevPageBtn = () => { const btn = getPrevPageBtn(); if(btn) btn.disabled = true; };
const enableNextPageBtn = () => { const btn = getNextPageBtn(); if(btn) btn.disabled = false; };
const disableNextPageBtn = () => { const btn = getNextPageBtn(); if(btn) btn.disabled = true; };


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
    if (datafimInput) datafimInput.value = '';
    if (convertCheckbox) convertCheckbox.checked = false; // Desmarca o checkbox

    if (chamadasTableBody) chamadasTableBody.innerHTML = '';
    clearStatus();
    allResults = []; // Limpa todos os resultados brutos
    urlsGravacoesEncontradas = []; // Limpa a lista para download (e AGORA para exibição)

    hideBaixarLoteBtn();
    enableBaixarLoteBtn();
    enableConsultarBtn();
    hidePaginationControls(); // Esconde controles de paginação
    currentPage = 1; // Reseta a página atual

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

    return { login, token, datainicioApi, datafimApi, cleanUserUrl, dateInicioObj, dateFimObj };
}


// --- Funções de Exibição de Resultados (AGORA COM EVENT LISTENER PARA DOWNLOAD INDIVIDUAL) ---

// Esta função AGORA recebe APENAS os dados da página que JÁ FORAM FILTRADOS para ter gravação
export function displayResults(dadosPaginaFiltrada, userUrlBase) {
    const chamadasTableBody = getChamadasTableBody();

    if (!chamadasTableBody) {
        console.error("Elemento #chamadasTable tbody não encontrado!");
        return;
    }

    chamadasTableBody.innerHTML = '';

    if (!Array.isArray(dadosPaginaFiltrada) || dadosPaginaFiltrada.length === 0) {
        console.log('A página atual não contém gravações para exibir.');
        return; // Sai da função se a página estiver vazia
    }

    dadosPaginaFiltrada.forEach(chamada => {
        const row = document.createElement('tr');

        // --- Determina Origem e Destino (já vêm no objeto da lista urlsGravacoesEncontradas) ---
        // Os campos src, dst, duration e numero já vêm prontos no objeto 'chamada'
        // pois foram adicionados ao mapear allResults para urlsGravacoesEncontradas
        const origem = chamada.src || 'N/A';
        const destino = chamada.dst || 'N/A';
        const numeroExibicao = chamada.numero || 'N/A';

        // Formata Duração (já vem bruta no objeto)
        const duracaoNumericaDoItem = parseInt(chamada.duration, 10);
        const duracaoFormatadaDoItem = !isNaN(duracaoNumericaDoItem) && duracaoNumericaDoItem >= 0 ? `${duracaoNumericaDoItem}s` : 'N/A';


        // --- Criação e Adição das Células ---
        // Célula: Número (Primeira coluna)
        const numeroCell = document.createElement('td');
        numeroCell.textContent = numeroExibicao;
        numeroCell.setAttribute('data-label', 'Número');
        row.appendChild(numeroCell);

        // Célula: Data/Hora (Segunda coluna)
        const datahoraCell = document.createElement('td');
        datahoraCell.textContent = chamada.datahora || 'N/A';
        datahoraCell.setAttribute('data-label', 'Data/Hora');
        row.appendChild(datahoraCell);

        // Célula: Origem (Terceira coluna)
        const origemCell = document.createElement('td');
        origemCell.textContent = origem; // Usa a origem já calculada e armazenada
        origemCell.setAttribute('data-label', 'Origem');
        row.appendChild(origemCell);

        // Célula: Destino (Quarta coluna)
        const destinoCell = document.createElement('td');
        destinoCell.textContent = destino; // Usa o destino já calculado e armazenado
        destinoCell.setAttribute('data-label', 'Destino');
        row.appendChild(destinoCell);

        // Célula: Duração (Quinta coluna)
        const duracaoCell = document.createElement('td');
        duracaoCell.innerHTML = duracaoFormatadaDoItem; // Usa a duração formatada
        duracaoCell.setAttribute('data-label', 'Duração (s)');
        row.appendChild(duracaoCell);


        // Célula: Gravação (Sexta coluna) - COM NOVO COMPORTAMENTO DE DOWNLOAD INDIVIDUAL
        const gravacaoCell = document.createElement('td');
        const urlGravacao = chamada.url || '#'; // A URL já está completa e validada na lista

        const linkGravacao = document.createElement('a');
        // O href ainda é a URL original, mas o clique será interceptado
        linkGravacao.href = urlGravacao;
        linkGravacao.textContent = MESSAGES.TEXT_BAIXAR_GRAVACAO; // Texto do link
        linkGravacao.innerHTML = `<i class="fas fa-download"></i> ${MESSAGES.TEXT_BAIXAR_GRAVACAO}`; // Ícone e texto

        // Adiciona um data attribute para identificar a URL da gravação
        linkGravacao.dataset.recordingUrl = urlGravacao;

        // Desabilita o link se não houver URL válido
        if (urlGravacao === '#') {
            linkGravacao.classList.add('disabled-link');
            linkGravacao.style.pointerEvents = 'none';
            linkGravacao.style.color = '#a0a0a0';
            linkGravacao.style.textDecoration = 'none';
            linkGravacao.title = "Gravação não disponível";
            linkGravacao.innerHTML = `<i class="fas fa-times-circle"></i> Indisponível`;
            // Não adiciona event listener se estiver desabilitado
        } else {
            // --- ADICIONA EVENT LISTENER PARA DOWNLOAD INDIVIDUAL ---
            linkGravacao.addEventListener('click', (event) => {
                event.preventDefault(); // IMPEDE O COMPORTAMENTO PADRÃO DO LINK
                const urlToDownload = event.currentTarget.dataset.recordingUrl; // Pega a URL do data attribute
                if (urlToDownload) {
                    baixarGravacaoIndividual(urlToDownload); // Chama a nova função
                }
            });
        }

        gravacaoCell.appendChild(linkGravacao);
        gravacaoCell.setAttribute('data-label', 'Gravação');

        row.appendChild(gravacaoCell);
        chamadasTableBody.appendChild(row);
    });

}


// --- Funções de Consulta API (fatiamento temporal) ---

// Função auxiliar para buscar dados da API Widevoice usando intervalo de datas
// Implementa a lógica de fatiamento temporal.
// Esta função é uma helper INTERNA de consultarChamadas, NÃO PRECISA ser exportada.
async function fetchWidevoiceDataByDateRange(urlBase, login, token, currentSearchStartApi, currentSearchEndApi, page) {
    const url = `https://${urlBase}/api.php?acao=statusreport&login=${login}&token=${token}`;
    const payload = { datainicio: currentSearchStartApi, datafim: currentSearchEndApi }; // Usa o parâmetro da função como o fim da faixa

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

    // Verifica se a resposta NÃO é um array E NÃO é null.
    // Se for null, tratamos como um array vazio ([])
    if (!Array.isArray(data) && data !== null) {
        throw new Error(`Resposta inesperada da API ao buscar página ${page}. Esperado um array ou null, mas recebeu: ${typeof data}. Resposta: ${JSON.stringify(data)}`);
    }

    // Se a resposta for null, retorna um array vazio. Caso contrário, retorna os dados (que agora sabemos que é um array).
    return data === null ? [] : data;
}


export async function consultarChamadas() {
    // Gerencia o estado dos botões e status no início
    disableConsultarBtn();
    hideBaixarLoteBtn(); // Esconde o botão de download em lote
    enableBaixarLoteBtn(); // Garante que não fique desabilitado se estava
    clearStatus();
    hidePaginationControls(); // Esconde controles de paginação
    const chamadasTableBody = getChamadasTableBody();
    if (chamadasTableBody) chamadasTableBody.innerHTML = ''; // Limpa a tabela

    allResults = []; // Zera todos os resultados brutos armazenados
    urlsGravacoesEncontradas = []; // Zera a lista para download (e AGORA para exibição paginada)
    currentPage = 1; // Reseta a página atual


    const formData = getAndValidateFormData();
    if (!formData) {
        enableConsultarBtn();
        // clearStatus() já foi chamado em getAndValidateFormData
        return;
    }

    showStatusLoading(MESSAGES.LOADING + ' (Iniciando busca por fatiamento temporal...)');
    salvarConfiguracoes();

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
                // A mensagem final será exibida no finally com base na quantidade de gravações encontradas
                break; // Quebra o loop
            }

            // Converte o início da busca atual (Date object) para o formato da API (YYYY-MM-DD HH:mm:ss)
            // E garante que não exceda a datafim original.
            const startApiFormatted = `${currentSearchStart.getFullYear()}-${String(currentSearchStart.getMonth() + 1).padStart(2, '0')}-${String(currentSearchStart.getDate()).padStart(2, '0')} ${String(currentSearchStart.getHours()).padStart(2, '0')}:${String(currentSearchStart.getMinutes()).padStart(2, '0')}:${String(currentSearchStart.getSeconds()).padStart(2, '0')}`;

            // A data/hora final da requisição é a datafim original da consulta.
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
            if (data.length === 0) {
                console.log(`API retornou 0 resultados para faixa ${startApiFormatted} a ${endApiFormatted}. Parando a busca.`);
                // Não precisamos exibir status de sucesso/nenhum resultado aqui.
                // Isso será feito no finally com base na lista final de gravações.
                break; // Sai do loop principal de paginação
            }


            // Se chegou até aqui, a API retornou dados (data.length > 0). Adiciona esses resultados aos resultados totais brutos.
            allResults = allResults.concat(data);

            // Se a quantidade de resultados retornados é menor que o limite de 500, significa que esta é a última página com dados
            // NESTA faixa temporal e, provavelmente, em todas as faixas subsequentes até a datafim original.
            if (data.length < API_LIMIT_PER_PAGE) {
                console.log(`API retornou ${data.length} resultados (< ${API_LIMIT_PER_PAGE}) para faixa ${startApiFormatted} a ${endApiFormatted}. Assumindo fim da busca.`);
                // Não precisamos exibir status de sucesso aqui.
                // Isso será feito no finally com base na lista final de gravações.
                break; // Sai do loop principal de paginação
            }

            // Se o loop não parou (data.length === API_LIMIT_PER_PAGE),
            // significa que há pelo menos 500 resultados NESTA faixa temporal.
            // Precisamos encontrar a data/hora mais recente entre eles
            // e definir o início da próxima busca para 1 segundo após essa data/hora.
            try {
                const latestRecord = data.reduce((latest, current) => {
                    if (!latest || (current.datahora && current.datahora > latest.datahora)) {
                        return current;
                    }
                    return latest;
                }, null);

                const latestDatahoraStr = latestRecord?.datahora;


                if (!latestDatahoraStr) {
                    throw new Error("Nenhum registro com campo 'datahora' válido encontrado nos resultados da página.");
                }

                const latestDate = new Date(latestDatahoraStr.replace(' ', 'T'));

                if (isNaN(latestDate.getTime())) {
                    throw new Error(`Datahora inválida no último registro ('${latestDatahoraStr}').`);
                }

                currentSearchStart = new Date(latestDate.getTime() + 1000);

                console.log(`Faixa retornou ${API_LIMIT_PER_PAGE} resultados. Próxima busca inicia em ${currentSearchStart.toLocaleString()}.`);

            } catch (dateError) {
                console.error(`Erro ao determinar o início da próxima faixa de busca: ${dateError.message}`, dateError);
                showStatusError(`❌ Erro ao processar data do último registro na tentativa ${page}: ${dateError.message}. Busca interrompida.`);
                break; // Aborta a busca em caso de erro na data do último registro
            }

            // Incrementa a página/tentativa de busca para o feedback
            page++;

        } // Fim do loop while (currentSearchStart <= originalSearchEnd)


        // --- Processamento final após obter TODOS os resultados brutos ---

        // ** AGORA: Filtra TODOS os resultados brutos para pegar APENAS aqueles com gravação **
        // ** E popula a lista urlsGravacoesEncontradas COM OBJETOS MAIS COMPLETOS para exibição **
        urlsGravacoesEncontradas = allResults
            .filter(chamada => chamada.gravacao && chamada.gravacao.trim() !== '') // Filtra APENAS quem tem gravação
            .map(chamada => {
                // Constroi o objeto para exibição E download com todos os campos necessários
                const caminho = chamada.gravacao.replaceAll("\\/", "/");
                const urlGravacao = chamada.recording_url || (caminho ? `https://${formData.cleanUserUrl}/gravador28/${caminho}.gsm` : '#');

                // Determina Origem e Destino para armazenar no objeto
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
                    numero: chamada.numero, // Adiciona o número da chamada
                    datahora: chamada.datahora,
                    src: origem, // Adiciona origem calculada
                    dst: destino, // Adiciona destino calculado
                    duration: chamada.duracao, // Adiciona duração bruta
                    url: urlGravacao // Adiciona a URL da gravação
                };
            })
            .filter(item => item.url && item.url !== '#'); // Filtra novamente para garantir URL válida no objeto final


        // Exibe os resultados da PRIMEIRA página dos ITENS COM GRAVAÇÃO
        // A função displayResults foi modificada para receber APENAS os dados da página a ser exibida (que já são os itens com gravação)
        showPage(1, formData.cleanUserUrl); // Exibe a primeira página por padrão


        // Gerencia o botão de baixar em lote e a mensagem final de status
        const numGravacoesEncontradas = urlsGravacoesEncontradas.length;

        if (numGravacoesEncontradas > 0) {
            showBaixarLoteBtn();
            // Exibe status de sucesso informando quantas gravações foram encontradas
            // Se a busca foi interrompida pelo limite máximo, a mensagem do limite máximo já deve estar lá
            if (!getStatusMessageArea()?.innerHTML.includes('Limite máximo')) {
                showStatusSuccess(`${MESSAGES.FINAL_RESULTS_DISPLAY(allResults.length)}. ${numGravacoesEncontradas} gravações encontradas.`);
            } else {
                // Se o limite máximo foi atingido, mantém a mensagem de aviso e adiciona a contagem de gravações
                const currentStatusText = getStatusMessageArea()?.textContent || '';
                // Garante que a mensagem não seja duplicada se já foi atualizada antes
                if (!currentStatusText.includes(`${numGravacoesEncontradas} gravações encontradas`)) {
                    getStatusMessageArea().textContent = `${currentStatusText.trim()} ${numGravacoesEncontradas} gravações encontradas.`;
                }
            }

        } else if (allResults.length > 0 && numGravacoesEncontradas === 0) {
            // Se encontrou resultados brutos, mas NENHUM com gravação
            hideBaixarLoteBtn();
            showStatusWarning(MESSAGES.NO_RECORDINGS_FOUND_FILTERED);

        } else {
            // Se não encontrou resultados brutos NENHUM (allResults.length === 0)
            hideBaixarLoteBtn();
            showStatusWarning(MESSAGES.NO_RESULTS); // Nenhum resultado encontrado no período ou nenhuma gravação

        }


    } catch (erro) {
        // Lidar com quaisquer erros que ocorreram durante as requisições (HTTP fetch, array inválido, etc.)
        handleApiError(erro); // Usa a função centralizada para exibir o erro

    } finally {
        // Garante que o botão Consultar seja reabilitado
        enableConsultarBtn();
        // Garante que o botão de download em lote seja reabilitado (visibilidade já tratada)
        enableBaixarLoteBtn();

        // Se houver gravações para exibir (mesmo que < resultsPerPage), mostra os controles de paginação
        // A paginação agora se baseia em urlsGravacoesEncontradas
        if (urlsGravacoesEncontradas.length > 0) {
            showPaginationControls();
            // Atualiza a info da página (já feito em showPage, mas bom garantir)
            const totalPages = Math.ceil(urlsGravacoesEncontradas.length / resultsPerPage); // Baseado em gravações
            updatePageInfo(currentPage, totalPages);
            updatePaginationButtons(); // Atualiza o estado dos botões de paginação (baseado em gravações)
        } else {
            // Se não há gravações, esconde os controles de paginação
            hidePaginationControls();
        }
    }
}


// --- Funções de Paginação no Frontend (AGORA BASEADO EM GRAVAÇÕES ENCONTRADAS) ---

// Função para exibir uma página específica de resultados (agora, de gravações encontradas)
function showPage(page, userUrlBase) {
    const startIndex = (page - 1) * resultsPerPage;
    // O endIndex não precisa ser ajustado, slice lida com o fim do array
    const endIndex = startIndex + resultsPerPage;
    // FATIA AGORA urlsGravacoesEncontradas
    const paginatedResults = urlsGravacoesEncontradas.slice(startIndex, endIndex);

    // Exibe apenas os resultados da página atual (que já são os itens com gravação)
    displayResults(paginatedResults, userUrlBase);

    // Atualiza as variáveis de estado e os controles de paginação
    currentPage = page;
    // TOTAL DE PÁGINAS AGORA SE BASEIA EM urlsGravacoesEncontradas.length
    const totalPages = Math.ceil(urlsGravacoesEncontradas.length / resultsPerPage);
    updatePageInfo(currentPage, totalPages);
    updatePaginationButtons();
}

// Função para atualizar o estado dos botões de paginação (habilitado/desabilitado)
// AGORA SE BASEIA EM GRAVAÇÕES ENCONTRADAS
function updatePaginationButtons() {
    const totalPages = Math.ceil(urlsGravacoesEncontradas.length / resultsPerPage); // Baseado em gravações

    if (currentPage === 1) {
        disablePrevPageBtn();
    } else {
        enablePrevPageBtn();
    }

    // Desabilita 'Próxima' se estiver na última página OU se não houver gravações
    if (currentPage === totalPages || urlsGravacoesEncontradas.length === 0) {
        disableNextPageBtn();
    } else {
        enableNextPageBtn();
    }
    // Se não houver gravações, desabilita ambos os botões
    if (urlsGravacoesEncontradas.length === 0) {
        disablePrevPageBtn();
        disableNextPageBtn();
    }
}

// Função para ir para a página anterior
function goToPreviousPage() {
    const userUrlBase = getElement('url_base')?.value.trim().replace(/^https?:\/\//, '') || ''; // Continua pegando do DOM
    if (currentPage > 1) {
        showPage(currentPage - 1, userUrlBase);
    }
}

// Função para ir para a próxima página
function goToNextPage() {
    const totalPages = Math.ceil(urlsGravacoesEncontradas.length / resultsPerPage); // Baseado em gravações
    const userUrlBase = getElement('url_base')?.value.trim().replace(/^https?:\/\//, '') || ''; // Continua pegando do DOM

    if (currentPage < totalPages) {
        showPage(currentPage + 1, userUrlBase);
    }
}


// --- Funções de Exibir Erros ---
function handleApiError(erro) {
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
    if (baixarLoteBtn) {
        hideBaixarLoteBtn(); // Garante que seja oculto em caso de erro na consulta
        enableBaixarLoteBtn(); // Garante que seja reabilitado
    }
}


// --- Funções de Download ---

// --- Função para Download INDIVIDUAL com Conversão (NOVA FUNÇÃO) ---
async function baixarGravacaoIndividual(recordingUrl) {
    const consultarBtn = getConsultarBtn();
    const baixarLoteBtn = getBaixarLoteBtn(); // Adicionado para desabilitar o botão de lote também

    showStatusLoading(MESSAGES.DOWNLOAD_PROCESSING + ' (Individual)...');
    if (consultarBtn) disableConsultarBtn();
    if (baixarLoteBtn) disableBaixarLoteBtn(); // Desabilita o botão de lote
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

            try {
                const errorData = await response.json();
                console.error('Dados de erro do backend (individual):', errorData);

                const errorMsg = errorData.error || errorData.details || `Status: ${response.status}`;
                showStatusError(`❌ Falha no download individual: ${errorMsg}`);

            } catch (jsonError) {
                console.error('Erro ao ler resposta de erro do backend (individual) como JSON, tentando como texto:', jsonError);
                try {
                    const errorText = await response.text();
                    console.error('Corpo da resposta de error como texto (individual):', errorText);
                    showStatusError(`❌ Falha no download individual: Status ${response.status}. Resposta: ${errorText}`);
                } catch (textError) {
                    showStatusError(`❌ Falha no download individual: Status ${response.status}. Não foi possível ler a resposta.`);
                }
            }
            return; // Sai da função após tratar o erro
        }

        // ** SE response.ok FOR TRUE (Status 200 OK) **
        // LER O CORPO DA RESPOSTA COMO BLOB (É O ARQUIVO MP3)
        console.log('Resposta do backend recebida (Status 200 OK - individual). Lendo corpo como Blob...');
        const mp3Blob = await response.blob();

        // Utiliza a função de salvar arquivo importada (que lida com FileSaver.js ou fallback)
        // Passa o blob do MP3 e os cabeçalhos da resposta do backend (para o nome do arquivo)
        saveBlobAsFile(mp3Blob, response.headers);

        // Feedback de sucesso é dado DENTRO de saveBlobAsFile (agora com nome de arquivo mais específico)

    } catch (error) {
        console.error('Erro na comunicação com o backend ou processamento/exibição do erro no frontend (individual):', error);
        showStatusError(`❌ Erro no download individual: ${error.message}`);

    } finally {
        // Reabilita os botões ao final
        if (consultarBtn) enableConsultarBtn();
        if (baixarLoteBtn) enableBaixarLoteBtn();
        // Reexibe os controles de paginação se houver GRAVAÇÕES para exibir
        if (urlsGravacoesEncontradas.length > 0) {
            showPaginationControls();
            updatePaginationButtons();
        }
    }
}


// --- Função principal do botão de download em lote ---
export async function baixarGravacoesEmLote() {
    // Esta função já usa urlsGravacoesEncontradas, então não precisa mudar
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

    const convertCheckbox = getElement(CHECKBOX_CONVERT_TO_MP3_ID);
    const convertToMp3 = convertCheckbox ? convertCheckbox.checked : false;

    fetchAndSaveZipFromBackend(urlsGravacoesEncontradas, convertToMp3);
}

// --- Função auxiliar para baixar o arquivo ZIP do backend e salvar ---
async function fetchAndSaveZipFromBackend(recordingsList, convertToMp3) {
    const baixarLoteBtn = getBaixarLoteBtn();
    const consultarBtn = getConsultarBtn(); // Adicionado para desabilitar durante o download

    showStatusLoading(MESSAGES.DOWNLOAD_PROCESSING);
    if (baixarLoteBtn) disableBaixarLoteBtn(); // Desabilita o botão
    if (consultarBtn) disableConsultarBtn(); // Desabilita o botão Consultar também
    hidePaginationControls(); // Esconde paginação durante o download

    try {
        const response = await fetchBackendZip(recordingsList, convertToMp3);

        if (!response.ok) {
            console.error(`Resposta de erro do backend: Status ${response.status}`);

            try {
                const errorData = await response.json();
                console.error('Dados de erro do backend:', errorData);

                if (errorData && (errorData.error || errorData.details || errorData.failedDownloads || errorData.failedConversions)) {
                    const errorMsg = errorData.error || errorData.details || `Status: ${response.status}`;
                    const failedDownloadsItems = errorData.failedDownloads;
                    const failedConversionsItems = errorData.failedConversions;

                    showStatusError(MESSAGES.DOWNLOAD_FAILED_DETAILS(errorMsg, failedDownloadsItems, failedConversionsItems));
                    return;

                } else {
                    console.warn('Resposta de erro do backend inesperada (formato JSON desconhecido).');
                    throw new Error(`Erro no formato da resposta de erro do backend. Status ${response.status}. Resposta JSON: ${JSON.stringify(errorData)}`);
                }

            } catch (jsonError) {
                console.error('Erro ao ler resposta de erro do backend como JSON, tentando como texto:', jsonError);
                try {
                    const errorText = await response.text();
                    console.error('Corpo da resposta de error como texto:', errorText);
                    throw new Error(`Erro do backend: Status ${response.status}. Resposta: ${errorText}`);
                } catch (textError) {
                    throw new Error(`Erro do backend: Status ${response.status}. Não foi possível ler a resposta.`);
                }
            }
        }

        console.log('Resposta do backend recebida (Status 200 OK). Lendo corpo como Blob...');
        const zipBlob = await response.blob();

        saveBlobAsFile(zipBlob, response.headers);
        // Feedback de sucesso é dado DENTRO de saveBlobAsFile

    } catch (error) {
        console.error('Erro na comunicação com o backend ou processamento/exibição do erro no frontend:', error);
        showStatusError(`❌ Erro: ${error.message}`);

    } finally {
        if (baixarLoteBtn) enableBaixarLoteBtn();
        if (consultarBtn) enableConsultarBtn();
        // Reexibe os controles de paginação se houver GRAVAÇÕES para exibir
        if (urlsGravacoesEncontradas.length > 0) {
            showPaginationControls();
            updatePaginationButtons();
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
    const prevPageBtn = getPrevPageBtn();
    if(prevPageBtn) {
        prevPageBtn.addEventListener('click', goToPreviousPage);
    }

    const nextPageBtn = getNextPageBtn();
    if(nextPageBtn) {
        nextPageBtn.addEventListener('click', goToNextPage);
    }

    // Inicializa o estado dos botões de paginação
    // (eles estarão desabilitados e ocultos se urlsGravacoesEncontradas estiver vazio)
    updatePaginationButtons();

    // O listener para download individual agora é adicionado DIRETAMENTE em cada link
    // quando eles são criados na função displayResults.
});