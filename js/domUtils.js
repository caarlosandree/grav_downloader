import { MESSAGES } from './constants.js';

// --- Funções de Acesso a Elementos DOM ---
export const getElement = (id) => {
    const element = document.getElementById(id);
    // O console.error movido para chamadas mais específicas se necessário
    return element;
};

export const getChamadasTableBody = () => document.querySelector('#chamadasTable tbody');


// --- Funções de Manipulação da Área de Status ---
export const getStatusMessageArea = () => getElement('statusMessageArea');

// Função ajustada para incluir ícones baseados na classe de status (simplificado)
export const showStatus = (message, className = '') => {
    const statusArea = getStatusMessageArea();
    if (statusArea) {
        // Remove todas as classes de status anteriores para garantir que apenas uma seja aplicada
        statusArea.classList.remove('loading', 'success', 'warning', 'error');

        // Mapeia a classe interna para um ícone Font Awesome
        let iconHtml = '';
        switch (className) {
            case 'loading':
                iconHtml = '<i class="fas fa-spinner fa-spin"></i> '; // Ícone girando
                break;
            case 'success':
                iconHtml = '<i class="fas fa-check-circle"></i> '; // Ícone de check
                break;
            case 'warning':
                iconHtml = '<i class="fas fa-exclamation-triangle"></i> '; // Ícone de triângulo
                break;
            case 'error':
                iconHtml = '<i class="fas fa-times-circle"></i> '; // Ícone de X
                break;
            default:
                iconHtml = ''; // Sem ícone para classes desconhecidas ou vazias
        }

        // Adiciona a classe de status atual à div
        if (className) {
            statusArea.classList.add(className);
        }

        // Define o conteúdo HTML com o ícone e a mensagem
        statusArea.innerHTML = `${iconHtml}${message}`;
    }
};


// As funções de atalho continuam iguais
export const showStatusLoading = (message = MESSAGES.LOADING) => showStatus(message, 'loading');
export const showStatusSuccess = (message) => showStatus(message, 'success');
export const showStatusError = (message) => showStatus(message, 'error');
export const showStatusWarning = (message) => showStatus(message, 'warning');

// Função clearStatus para limpar a mensagem e remover as classes de status
export const clearStatus = () => {
    const statusArea = getStatusMessageArea();
    if (statusArea) {
        statusArea.innerHTML = '';
        // Remove todas as classes de status
        statusArea.classList.remove('loading', 'success', 'warning', 'error');
        // Garante que a classe base 'status-message' permaneça (se existir no HTML)
        // statusArea.className = 'status-message'; // Descomente se quiser garantir apenas a classe base
    }
};


// --- Funções de Manipulação de Botões ---
export const getConsultarBtn = () => getElement('consultarBtn');
export const getBaixarLoteBtn = () => getElement('baixarLoteBtn');
export const disableConsultarBtn = () => { const btn = getConsultarBtn(); if(btn) btn.disabled = true; };
export const enableConsultarBtn = () => { const btn = getConsultarBtn(); if(btn) btn.disabled = false; };
export const disableBaixarLoteBtn = () => { const btn = getBaixarLoteBtn(); if(btn) btn.disabled = true; };
export const enableBaixarLoteBtn = () => { const btn = getBaixarLoteBtn(); if(btn) btn.disabled = false; };
export const showBaixarLoteBtn = () => { const btn = getBaixarLoteBtn(); if(btn) btn.style.display = 'block'; };
export const hideBaixarLoteBtn = () => { const btn = getBaixarLoteBtn(); if(btn) btn.style.display = 'none'; };