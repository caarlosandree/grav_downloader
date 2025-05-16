// js/uiManager.js

import {
    getElement, // Importado de domUtils
    getChamadasTableBody, // Importado de domUtils
    // ... outras importações de domUtils para status, botões ...
    showStatusLoading, showStatusSuccess, showStatusError, showStatusWarning, clearStatus,
    showBaixarLoteBtn, hideBaixarLoteBtn, enableBaixarLoteBtn, disableBaixarLoteBtn,
    disableConsultarBtn, enableConsultarBtn, // Adicionado importações de botões consultar
} from './domUtils.js'; // Importa apenas o que domUtils REALMENTE EXPORTA

import { getState } from './state.js'; // Importa o estado
import { MESSAGES } from './constants.js'; // Importa constantes
// REMOVIDO: baixarGravacaoIndividual não precisa ser importada aqui, é chamada no event listener delegado no app.js

// --- Funções de Acesso a Elementos DOM (Definidas AQUI usando getElement) ---
const getPaginationControls = () => getElement('paginationControls'); // Definido aqui
const getPrevPageBtn = () => getElement('prevPageBtn'); // Definido aqui
const getNextPageBtn = () => getElement('nextPageBtn'); // Definido aqui
const getPageInfoSpan = () => getElement('pageInfo'); // Definido aqui

const getFilterContainer = () => getElement('filter-container'); // Definido aqui


// --- Funções de Manipulação da Paginação (Definidas AQUI) ---
export const showPaginationControls = () => {
    const controls = getPaginationControls();
    if (controls) controls.style.display = 'flex'; // Usa flex para centralizar
};
export const hidePaginationControls = () => {
    const controls = getPaginationControls();
    if (controls) controls.style.display = 'none';
};
const updatePageInfo = (current, total) => {
    const pageInfoSpan = getPageInfoSpan();
    if (pageInfoSpan) pageInfoSpan.textContent = `Página ${total === 0 ? 0 : current} de ${total}`;
};


// Função para atualizar o estado dos botões de paginação (habilitado/desabilitado)
// SE BASEIA EM currentlyFilteredResults.length (obtido do estado)
export function updatePaginationButtons() {
    const { currentlyFilteredResults, resultsPerPage, currentPage } = getState();
    const totalPages = Math.ceil(currentlyFilteredResults.length / resultsPerPage); // Baseado em resultados FILTRADOS

    const prevBtn = getPrevPageBtn();
    const nextBtn = getNextPageBtn();

    if (prevBtn) prevBtn.disabled = currentPage === 1 || totalPages === 0;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages || totalPages === 0;

    // Atualiza o texto da página também
    updatePageInfo(currentPage, totalPages);
}


// --- Funções de Exibição de Resultados na Tabela ---
// Recebe APENAS os dados da página a ser exibida
export function displayResultsPage(dadosPaginaFiltrada) {
    const chamadasTableBody = getChamadasTableBody(); // Importado de domUtils

    if (!chamadasTableBody) {
        console.error("Elemento #chamadasTable tbody não encontrado!");
        // Mesmo sem tabela, os controles de paginação devem refletir o total
        updatePaginationButtons(); // Garante que a info da página esteja 0 de 0
        return;
    }

    // Limpa o conteúdo atual da tabela
    chamadasTableBody.innerHTML = '';

    // A paginação agora se baseia em currentlyFilteredResults.length
    const { currentlyFilteredResults } = getState(); // Obtém do estado
    const totalGravacoesFiltradas = currentlyFilteredResults.length;

    if (!Array.isArray(dadosPaginaFiltrada) || dadosPaginaFiltrada.length === 0) {
        console.log('A página atual não contém gravações para exibir na tabela (após filtros ou sem resultados).');
        // Mesmo que a página esteja vazia, os controles de paginação devem refletir o total FILTRADO
        updatePaginationButtons(); // Garante que a info da página esteja correta (0 de X ou Y de Z)
        // Se não há resultados filtrados NENHUM, oculta paginação
        if (totalGravacoesFiltradas === 0) {
            hidePaginationControls();
            // Mensagem de "nenhum resultado filtrado" é tratada em applyFilters
        } else {
            showPaginationControls(); // Mostra se há resultados filtrados em outras páginas
        }
        return;
    }

    dadosPaginaFiltrada.forEach(item => {
        const row = document.createElement('tr');

        // --- Criação e Adição das Células na ORDEM DEFINIDA NO HTML ---

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

        // Célula: Gravação (Download) (SÉTIMO/ÚLTIMO) - COM EVENT LISTENER DELEGADO NO app.js
        const gravacaoCell = document.createElement('td');
        gravacaoCell.setAttribute('data-label', 'Gravação'); // Para visualização mobile

        // CORRIGIDO: Verifica item.url_gravacao em vez de item.url
        const urlGravacao = item.url_gravacao || '#';

        if (urlGravacao !== '#') {
            const downloadLink = document.createElement('a');
            // O href não precisa ser a URL real, o event listener vai usar o data attribute
            downloadLink.href = '#';
            downloadLink.textContent = MESSAGES.TEXT_BAIXAR_GRAVACAO; // Texto do link (se definido em constants)
            downloadLink.title = 'Baixar gravação individual';
            downloadLink.style.cursor = 'pointer'; // Indica que é clicável
            downloadLink.classList.add('download-link'); // Adiciona classe para delegação de eventos

            // CORRIGIDO: Armazena item.url_gravacao em vez de item.url no atributo data
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
            // Caso não tenha URL de gravação válida na propriedade 'url_gravacao'
            gravacaoCell.innerHTML = '<em>Sem gravação</em>';
            gravacaoCell.classList.add('disabled-link'); // Adiciona classe para estilização
        }
        row.appendChild(gravacaoCell);

        chamadasTableBody.appendChild(row);
    });

    // Atualiza os botões de paginação após exibir a página
    updatePaginationButtons();
    // showPaginationControls(); // Já gerenciado no final do applyFilters ou consultarChamadas/handleApiError
}

// --- Funções de Visibilidade de Seções (Definidas AQUI) ---
export function showFilterSection() {
    const filterContainer = getFilterContainer(); // Usa a função definida aqui
    if (filterContainer) filterContainer.style.display = 'block'; // Usa block para layout vertical
}

export function hideFilterSection() {
    const filterContainer = getFilterContainer(); // Usa a função definida aqui
    if (filterContainer) filterContainer.style.display = 'none';
}

// --- Outras Funções de UI (Importadas ou Definidas aqui) ---
// Funções para exibir/ocultar/habilitar/desabilitar botões (importadas de domUtils)
export { showBaixarLoteBtn, hideBaixarLoteBtn, enableBaixarLoteBtn, disableBaixarLoteBtn };
export { disableConsultarBtn, enableConsultarBtn }; // Adicionado export para botões consultar

// Funções de status (importadas de domUtils)
export { showStatusLoading, showStatusSuccess, showStatusError, showStatusWarning, clearStatus };


// Função para inicializar o estado visual da interface
// Chamada na carga inicial e ao limpar campos/erros críticos
export function initializeUIState() {
    // Oculta o botão de baixar lote, a paginação e a seção de filtros
    hideBaixarLoteBtn();
    hidePaginationControls();
    hideFilterSection();
    // Desabilita o botão de baixar lote na carga inicial
    disableBaixarLoteBtn();
    // Reseta a info da página para 0 de 0 e desabilita botões de paginação
    updatePaginationButtons(); // Chama para garantir que a info da página esteja correta

    // Garante que o botão Consultar esteja habilitado ao iniciar ou resetar
    enableConsultarBtn();

    // Limpa qualquer mensagem de status anterior
    clearStatus();

    console.log("Estado inicial da UI configurado.");
}