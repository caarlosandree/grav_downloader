// js/paginationService.js

import { getState, setCurrentPage } from './state.js';
import { displayResultsPage, updatePaginationButtons } from './uiManager.js'; // Importaremos de uiManager mais tarde

// --- Funções de Paginação ---

// Calcula o total de páginas baseado nos resultados FILTRADOS
export const getTotalPages = () => {
    const { currentlyFilteredResults, resultsPerPage } = getState();
    return Math.ceil(currentlyFilteredResults.length / resultsPerPage);
};


// Função para exibir uma página específica de resultados (agora, de gravações encontradas E FILTRADAS)
export function showPage(page) {
    const { currentlyFilteredResults, resultsPerPage } = getState();

    // Validação básica para garantir que a página é válida
    const totalPages = getTotalPages();
    if (page < 1 || (page > totalPages && totalPages > 0)) {
        console.warn(`Tentativa de exibir página inválida: ${page}. Total de páginas: ${totalPages}. Redirecionando.`);
        // Redirecionar para a primeira ou última página válida
        page = totalPages > 0 ? totalPages : 1;
        // currentPage será atualizada logo após o slice e antes de displayResultsPage
    } else if (totalPages === 0) {
        // Se não há páginas, garante que a página atual seja 1
        page = 1;
    }

    const startIndex = (page - 1) * resultsPerPage;
    const endIndex = startIndex + resultsPerPage;
    // FATIA currentlyFilteredResults para a página atual
    const paginatedResults = currentlyFilteredResults.slice(startIndex, endIndex);

    // Atualiza a variável de estado da página atual ANTES de exibir
    setCurrentPage(page);

    // Exibe apenas os resultados da página atual (que já são os itens com gravação E filtrados)
    // CHAMA FUNÇÃO DE UI Manager para exibir
    displayResultsPage(paginatedResults);

    // A função updatePaginationButtons já é chamada dentro de displayResultsPage (no uiManager)
}


// Função para ir para a página anterior
export function goToPreviousPage() {
    const { currentPage } = getState();
    if (currentPage > 1) {
        showPage(currentPage - 1);
    }
}

// Função para ir para a próxima página
export function goToNextPage() {
    const { currentPage } = getState();
    const totalPages = getTotalPages(); // Baseado em resultados FILTRADOS
    if (currentPage < totalPages) {
        showPage(currentPage + 1);
    }
}