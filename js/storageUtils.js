import { LOCAL_STORAGE_KEY } from './constants.js'; // Importa apenas a chave
import { getElement } from './domUtils.js'; // CORRIGIDO: Importa getElement de domUtils.js

export function salvarConfiguracoes() {
    const url_base = getElement('url_base')?.value.trim() || '';
    const login = getElement('login')?.value.trim() || '';
    const token = getElement('token')?.value.trim() || '';
    const datainicio = getElement('datainicio')?.value || '';
    const datafim = getElement('datafim')?.value || '';

    // CORRIGIDO: Removida a duplicação de 'datafim' no objeto config
    const config = { url_base, login, token, datainicio, datafim };
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config));
        console.log('Configurações salvas no localStorage.');
    } catch (e) {
        console.error('Erro ao salvar configurações no localStorage:', e);
    }
}

export function carregarConfiguracoes() {
    const savedConfig = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            // Usa getElement importado
            const urlBaseInput = getElement('url_base');
            const loginInput = getElement('login');
            const tokenInput = getElement('token');
            const datainicioInput = getElement('datainicio');
            const datafimInput = getElement('datafim');

            if (urlBaseInput) urlBaseInput.value = config.url_base || '';
            if (loginInput) loginInput.value = config.login || '';
            if (tokenInput) tokenInput.value = config.token || '';
            if (datainicioInput) datainicioInput.value = config.datainicio || '';
            if (datafimInput) datafimInput.value = config.datafim || '';

            console.log('Configurações carregadas do localStorage.');
        } catch (e) {
            console.error('Erro ao carregar configurações do localStorage:', e);
            alert('Erro ao carregar configurações salvas. Elas podem estar corrompidas.');
        }
    }
}