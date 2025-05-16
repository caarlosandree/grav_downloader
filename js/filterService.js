// js/filterService.js

import { getState, setCurrentlyFilteredResults, setCurrentPage } from './state.js';
import { getElement } from './domUtils.js'; // Importa getElement de domUtils
import { displayResultsPage } from './uiManager.js'; // Importa a função de exibição paginada (de uiManager)
import {
    hideBaixarLoteBtn,
    showBaixarLoteBtn,
    disableBaixarLoteBtn,
    enableBaixarLoteBtn,
    // REMOVIDO: hidePaginationControls, // Definido em uiManager
    // REMOVIDO: showPaginationControls // Definido em uiManager
} from './domUtils.js'; // Importa funções básicas de manipulação de botões de domUtils

// CORRIGIDO: Importa as funções de controle de paginação, visibilidade de filtros e status de uiManager
import { showPaginationControls, hidePaginationControls, showFilterSection, hideFilterSection, updatePaginationButtons, showStatusWarning, clearStatus } from './uiManager.js';
import { MESSAGES } from './constants.js'; // Importa mensagens

// --- Funções de Acesso a Elementos DOM para Filtros (Definidas AQUI usando getElement) ---
const getFilterRamalInput = () => getElement('filterRamal'); // Definido aqui
const getFilterNomeOperadorInput = () => getElement('filterNomeOperador'); // Definido aqui
const getFilterOrigemInput = () => getElement('filterOrigem'); // Definido aqui
const getFilterDestinoInput = () => getElement('filterDestino'); // Definido aqui


// --- Lógica de Filtros ---

// Função para aplicar os filtros
export function applyFilters() {
    // Usa as funções definidas localmente para obter os valores dos inputs
    const ramalFilter = getFilterRamalInput()?.value.trim().toLowerCase() || '';
    const nomeOperadorFilter = getFilterNomeOperadorInput()?.value.trim().toLowerCase() || '';
    const origemFilter = getFilterOrigemInput()?.value.trim().toLowerCase() || '';
    const destinoFilter = getFilterDestinoInput()?.value.trim().toLowerCase() || '';

    const { urlsGravacoesEncontradas, resultsPerPage } = getState();

    console.log('Aplicando filtros:', { ramal: ramalFilter, nomeoperador: nomeOperadorFilter, origem: origemFilter, destino: destinoFilter });

    // Filtra a lista COMPLETA de gravações encontradas (urlsGravacoesEncontradas)
    const filtered = urlsGravacoesEncontradas.filter(item => {
        // Garante que os campos existem antes de chamar toLowerCase() ou includes()
        const ramalMatch = !ramalFilter || (item.ramal && typeof item.ramal === 'string' && item.ramal.toLowerCase().includes(ramalFilter));
        const nomeOperadorMatch = !nomeOperadorFilter || (item.nomeoperador && typeof item.nomeoperador === 'string' && item.nomeoperador.toLowerCase().includes(nomeOperadorFilter));
        const origemMatch = !origemFilter || (item.src && typeof item.src === 'string' && item.src.toLowerCase().includes(origemFilter));
        const destinoMatch = !destinoFilter || (item.dst && typeof item.dst === 'string' && item.dst.toLowerCase().includes(destinoFilter));

        return ramalMatch && nomeOperadorMatch && origemMatch && destinoMatch;
    });

    setCurrentlyFilteredResults(filtered); // Atualiza o estado com a lista filtrada

    console.log(`Resultados após filtros: ${filtered.length} de ${urlsGravacoesEncontradas.length}`);

    // Reseta a paginação para a primeira página dos resultados filtrados
    setCurrentPage(1);

    // Exibe a primeira página dos resultados filtrados
    displayResultsPage(filtered.slice(0, resultsPerPage));


    // Atualiza o estado do botão de download em lote, paginação E EXIBE A SEÇÃO DE FILTROS
    if (filtered.length > 0) {
        enableBaixarLoteBtn(); // Importado de domUtils
        showBaixarLoteBtn(); // Importado de domUtils
        showPaginationControls(); // Importado de uiManager
        showFilterSection(); // <-- CORRIGIDO: Exibe a seção de filtros aqui!
        clearStatus(); // Limpa o status se houver resultados após aplicar/limpar filtros

    } else {
        disableBaixarLoteBtn(); // Importado de domUtils
        hideBaixarLoteBtn(); // Importado de domUtils
        hidePaginationControls(); // Importado de uiManager
        hideFilterSection(); // Oculta a seção de filtros se não houver resultados filtrados
        showStatusWarning(MESSAGES.NO_RECORDINGS_FOUND_FILTERED + ' (após aplicar filtros)'); // Importado de uiManager
    }

    // A função updatePaginationButtons é chamada dentro de displayResultsPage (em uiManager)
}

// Função para limpar os campos de filtro (inputs)
export function clearFilterFields() {
    // Usa as funções definidas localmente para obter os inputs
    const ramalInput = getFilterRamalInput();
    const nomeOperadorInput = getFilterNomeOperadorInput();
    const origemInput = getFilterOrigemInput();
    const destinoInput = getFilterDestinoInput();

    if (ramalInput) ramalInput.value = '';
    if (nomeOperadorInput) nomeOperadorInput.value = '';
    if (origemInput) origemInput.value = '';
    if (destinoInput) destinoInput.value = '';
}

// Função para limpar filtros e reaplicar (mostrando todos os resultados)
export function clearFilters() {
    clearFilterFields();
    applyFilters(); // Aplicar filtros vazios mostra todos os resultados

    // Garantir que os controles voltem a aparecer se houver resultados após limpar
    const { currentlyFilteredResults } = getState();
    if (currentlyFilteredResults.length > 0) {
        showBaixarLoteBtn();
        enableBaixarLoteBtn();
        showPaginationControls();
        showFilterSection(); // Garante que a seção de filtro reapareça
        updatePaginationButtons(); // Garante info da página correta
        clearStatus(); // Limpa o status após limpar filtros com sucesso
    } else {
        // Se mesmo sem filtro não há resultados, esconde tudo e mostra aviso
        hideBaixarLoteBtn();
        disableBaixarLoteBtn();
        hidePaginationControls();
        hideFilterSection(); // Oculta a seção de filtro se não houver resultados
        updatePaginationButtons();
        showStatusWarning(MESSAGES.NO_RECORDINGS_FOUND_FILTERED + ' (após limpar filtros)');
    }

}