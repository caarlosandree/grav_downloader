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

import { fetchBackendZip } from './backendApi.js'; // Importa a função do Backend API
import { saveBlobAsFile } from './fileUtils.js'; // Importa a função de salvar arquivo


// --- Variáveis de Estado ---
let allResults = []; // Armazena TODOS os resultados da consulta bruta da API
// AGORA A PAGINAÇÃO VAI USAR urlsGravacoesEncontradas
let urlsGravacoesEncontradas = []; // Armazena objetos { url: string, datahora: string, src: string, dst: string, duration: string } APENAS para itens COM gravação
let currentPage = 1;
const resultsPerPage = 30; // Definido o número de resultados por página


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

    // Retornando dateFimObj (nome correto)
    return { login, token, datainicioApi, datafimApi, cleanUserUrl, dateInicioObj, dateFimObj };
}


// --- Funções de Exibição de Resultados (Agora exibe apenas a página atual) ---

// Esta função AGORA recebe APENAS os dados da página que JÁ FORAM FILTRADOS para ter gravação
export function displayResults(dadosPaginaFiltrada, userUrlBase) {
    const chamadasTableBody = getChamadasTableBody();

    if (!chamadasTableBody) {
        console.error("Elemento #chamadasTable tbody não encontrado!");
        return;
    }

    // Limpa o corpo da tabela antes de adicionar novos resultados
    chamadasTableBody.innerHTML = '';

    // NÃO PRECISAMOS MAIS FILTRAR AQUI. dadosPaginaFiltrada JÁ CONTÉM APENAS OS ITENS COM GRAVAÇÃO.
    // const chamadasComGravacaoPagina = Array.isArray(dadosPagina) ? dadosPagina.filter(chamada => chamada.gravacao && chamada.gravacao.trim() !== '') : [];

    if (!Array.isArray(dadosPaginaFiltrada) || dadosPaginaFiltrada.length === 0) {
        // Se a página atual está vazia (o que pode acontecer se o total de gravações for < resultsPerPage na última página)
        console.log('A página atual não contém gravações para exibir.');
        // A tabela já foi limpa. Nada a adicionar.
        return; // Sai da função se a página estiver vazia
    }


    // Itera diretamente sobre os dados da página (que já são os itens com gravação)
    dadosPaginaFiltrada.forEach(chamada => {
        const row = document.createElement('tr');

        // --- Determina Origem e Destino com base no tipo de chamada ('chamada' E ou S) ---
        let origem = 'N/A';
        let destino = 'N/A';
        let numeroExibicao = chamada.numero || 'N/A'; // Usa o campo 'numero' como principal para a coluna 'Número'

        if (chamada.chamada === 'E') { // Chamada de Entrada
            origem = chamada.call_entrada || 'N/A'; // Origem é o número externo
            destino = chamada.numero || chamada.ramal || 'N/A'; // Destino é o número interno ou ramal
        } else if (chamada.chamada === 'S') { // Chamada de Saída
            origem = chamada.ramal || chamada.numero || 'N/A'; // Origem é o ramal ou número interno que ligou
            destino = chamada.numero || chamada.call_entrada || 'N/A'; // Destino é o número externo discado
        } else {
            // Caso 'chamada' não seja 'E' nem 'S' (ou esteja faltando)
            origem = chamada.ramal || chamada.numero || chamada.call_entrada || 'N/A';
            destino = 'N/A'; // Ou outra lógica dependendo do tipo
        }

        // Formata Duração (verifica se é um número válido e adiciona 's')
        const duracaoNumerica = parseInt(chamada.duracao, 10);
        const duracaoFormatada = !isNaN(duracaoNumerica) && duracaoNumerica >= 0 ? `${duracaoNumerica}s` : 'N/A';


        // --- Criação e Adição das Células (<td>) na ORDEM CORRETA (Baseado no index.html) ---

        // Célula: Número (Primeira coluna)
        const numeroCell = document.createElement('td');
        // A lista urlsGravacoesEncontradas armazena src, dst, duration, mas não numero
        // Precisamos manter o objeto original da chamada para ter acesso ao numero
        // ALTERNATIVA: Reestruturar urlsGravacoesEncontradas para incluir o numero
        // Vamos assumir que o objeto 'chamada' aqui é o objeto original da API, o que faz sentido
        // se o slice for feito DEPOIS de filtrar para urlsGravacoesEncontradas
        // ou se urlsGravacoesEncontradas for uma lista de objetos MAIS COMPLETOS
        // Pelo código atual, urlsGravacoesEncontradas É uma lista de objetos { url, datahora, src, dst, duration }
        // Então precisamos ajustar como pegamos o 'numero' ou incluí-lo na lista urlsGravacoesEncontradas

        // *** REVISÃO: urlsGravacoesEncontradas está sendo mapeada para { url, datahora, src, dst, duration } ***
        // *** Precisamos que displayResults receba objetos com 'numero' também ***
        // *** Vamos modificar o map ao criar urlsGravacoesEncontradas para incluir o 'numero' ***

        // Célula: Número (Primeira coluna)
        // Agora 'chamada' dentro do loop já tem 'numero'
        numeroCell.textContent = chamada.numero || 'N/A';
        numeroCell.setAttribute('data-label', 'Número');
        row.appendChild(numeroCell);

        // Célula: Data/Hora (Segunda coluna)
        numeroCell.textContent = chamada.numero || 'N/A'; // CORRIGIDO: Usar 'numero'
        numeroCell.setAttribute('data-label', 'Número');
        row.appendChild(numeroCell);

        // Célula: Data/Hora (Segunda coluna)
        const datahoraCell = document.createElement('td');
        datahoraCell.textContent = chamada.datahora || 'N/A';
        datahoraCell.setAttribute('data-label', 'Data/Hora');
        row.appendChild(datahoraCell);

        // Célula: Origem (Terceira coluna)
        const origemCell = document.createElement('td');
        // Agora 'chamada' dentro do loop já tem 'src' calculado
        origemCell.textContent = chamada.src || 'N/A'; // Usa a origem já calculada e armazenada
        origemCell.setAttribute('data-label', 'Origem');
        row.appendChild(origemCell);

        // Célula: Destino (Quarta coluna)
        const destinoCell = document.createElement('td');
        // Agora 'chamada' dentro do loop já tem 'dst' calculado
        destinoCell.textContent = chamada.dst || 'N/A'; // Usa o destino já calculado e armazenado
        destinoCell.setAttribute('data-label', 'Destino');
        row.appendChild(destinoCell);

        // Célula: Duração (Quinta coluna)
        const duracaoCell = document.createElement('td');
        // Agora 'chamada' dentro do loop já tem 'duration' bruto
        // Precisamos formatar AQUI para exibição
        const duracaoNumericaDoItem = parseInt(chamada.duration, 10); // Usa a duração bruta armazenada
        const duracaoFormatadaDoItem = !isNaN(duracaoNumericaDoItem) && duracaoNumericaDoItem >= 0 ? `${duracaoNumericaDoItem}s` : 'N/A';
        duracaoCell.innerHTML = duracaoFormatadaDoItem; // Usa a duração formatada
        duracaoCell.setAttribute('data-label', 'Duração (s)');
        row.appendChild(duracaoCell);


        // Célula: Gravação (Sexta coluna)
        const gravacaoCell = document.createElement('td');
        // A URL já está completa em chamada.url
        const urlGravacao = chamada.url || '#';

        const linkGravacao = document.createElement('a');
        linkGravacao.href = urlGravacao;
        linkGravacao.target = '_blank';
        // Desabilita o link se não houver URL válido
        if (urlGravacao === '#') {
            linkGravacao.classList.add('disabled-link'); // Adiciona uma classe para estilizar
            linkGravacao.style.pointerEvents = 'none'; // Desabilita cliques
            linkGravacao.style.color = '#a0a0a0'; // Cor cinza para indicar desabilitado
            linkGravacao.style.textDecoration = 'none';
            linkGravacao.title = "Gravação não disponível";
            linkGravacao.innerHTML = `<i class="fas fa-times-circle"></i> Indisponível`; // Ícone e texto diferentes
        } else {
            linkGravacao.innerHTML = `<i class="fas fa-download"></i> ${MESSAGES.TEXT_BAIXAR_GRAVACAO}`;
        }

        gravacaoCell.appendChild(linkGravacao);
        gravacaoCell.setAttribute('data-label', 'Gravação');


        row.appendChild(gravacaoCell);

        // Anexa a linha completa ao corpo da tabela
        chamadasTableBody.appendChild(row);
    });

    // O gerenciamento do botão de baixar em lote e status final
    // continua em consultarChamadas após a busca completa.

}


// --- Funções de Consulta API (COM PAGINAÇÃO POR FATIAMENTO TEMPORAL E PAGINAÇÃO NO FRONTEND) ---

// Função auxiliar para buscar dados da API Widevoice usando intervalo de datas
// Implementa a lógica de fatiamento temporal.
// Esta função é uma helper INTERNA de consultarChamadas, NÃO PRECISA ser exportada.
async function fetchWidevoiceDataByDateRange(urlBase, login, token, currentSearchStartApi, currentSearchEndApi, page) {
    const url = `https://${urlBase}/api.php?acao=statusreport&login=${login}&token=${token}`;
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
                // Exibe o aviso de limite máximo imediatamente
                // A mensagem final será exibida no finally com base na quantidade de gravações encontradas
                // showStatusWarning(MESSAGES.FINAL_RESULTS_DISPLAY(allResults.length) + ` ⚠️ Limite máximo de páginas (${MAX_PAGES_CONSULTATION}) atingido. Resultados podem estar incompletos.`);
                // Quebra o loop
                break;
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
                // Constroi o objeto para exibição e download com todos os campos necessários
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
                getStatusMessageArea().textContent = `${currentStatusText} ${numGravacoesEncontradas} gravações encontradas.`;
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


// --- Funções de Exibir Erros da API de Consulta (Widevoice API) ---
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


// --- Funções de Download em Lote ---

// Função principal do botão de download em lote (apenas confirmação e chamada)
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

// Função auxiliar para baixar o arquivo ZIP do backend e salvar (agora separada)
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
        if (urlsGravacoesEncontradas.length > 0) { // AGORA VERIFICA urlsGravacoesEncontradas
            showPaginationControls();
            updatePaginationButtons();
        }
    }
}


// --- Event Listeners ---

window.addEventListener('load', carregarConfiguracoes);

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

    const prevPageBtn = getPrevPageBtn();
    if(prevPageBtn) {
        prevPageBtn.addEventListener('click', goToPreviousPage);
    }

    const nextPageBtn = getNextPageBtn();
    if(nextPageBtn) {
        nextPageBtn.addEventListener('click', goToNextPage);
    }

    // Inicializa o estado dos botões de paginação ao carregar a página
    // (eles estarão desabilitados e ocultos se urlsGravacoesEncontradas estiver vazio)
    updatePaginationButtons();
});