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
export const showStatus = (message, className = '') => {
    const statusArea = getStatusMessageArea();
    if (statusArea) {
        statusArea.innerHTML = message;
        statusArea.className = className;
    }
};

export const showStatusLoading = (message = MESSAGES.LOADING) => showStatus(message, 'loading');
export const showStatusSuccess = (message) => showStatus(message, 'success');
export const showStatusError = (message) => showStatus(message, 'error');
export const showStatusWarning = (message) => showStatus(message, 'warning');
export const clearStatus = () => showStatus('');


// --- Funções de Manipulação de Botões ---
export const getConsultarBtn = () => getElement('consultarBtn');
export const getBaixarLoteBtn = () => getElement('baixarLoteBtn');
export const disableConsultarBtn = () => { const btn = getConsultarBtn(); if(btn) btn.disabled = true; };
export const enableConsultarBtn = () => { const btn = getConsultarBtn(); if(btn) btn.disabled = false; };
export const disableBaixarLoteBtn = () => { const btn = getBaixarLoteBtn(); if(btn) btn.disabled = true; };
export const enableBaixarLoteBtn = () => { const btn = getBaixarLoteBtn(); if(btn) btn.disabled = false; };
export const showBaixarLoteBtn = () => { const btn = getBaixarLoteBtn(); if(btn) btn.style.display = 'block'; };
export const hideBaixarLoteBtn = () => { const btn = getBaixarLoteBtn(); if(btn) btn.style.display = 'none'; };