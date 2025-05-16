// js/downloadService.js


import { showStatusLoading, showStatusError, enableConsultarBtn, disableConsultarBtn, enableBaixarLoteBtn, disableBaixarLoteBtn, showBaixarLoteBtn, hideBaixarLoteBtn, getStatusMessageArea } from './domUtils.js';
// CORRIGIDO: Importa BACKEND_DOWNLOAD_SINGLE_URL DE ./constants.js
import { MESSAGES, BACKEND_DOWNLOAD_SINGLE_URL, CHECKBOX_CONVERT_TO_MP3_ID } from './constants.js';
import { fetchBackendZip } from './backendApi.js'; // Importa a função do backendApi
import { saveBlobAsFile } from './fileUtils.js'; // Importa a função para salvar arquivo
import { getState } from './state.js';
import { hidePaginationControls, showPaginationControls, hideFilterSection, showFilterSection, updatePaginationButtons, showStatusWarning } from './uiManager.js'; // Importa de uiManager

// --- Funções de Download ---

// Função para Download INDIVIDUAL com Conversão
export async function baixarGravacaoIndividual(recordingUrl) {
    showStatusLoading(MESSAGES.DOWNLOAD_PROCESSING + ' (Individual)...');
    disableConsultarBtn();
    disableBaixarLoteBtn(); // Desabilita o botão de lote
    hidePaginationControls(); // Oculta paginação durante o download
    hideFilterSection(); // Oculta filtros durante o download individual


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
        const { currentlyFilteredResults } = getState();
        // Reabilita o botão de baixar lote apenas se houver gravações na lista filtrada
        if (currentlyFilteredResults.length > 0) { // AGORA USA currentlyFilteredResults
            enableBaixarLoteBtn();
            showBaixarLoteBtn(); // Garante que esteja visível
        } else {
            disableBaixarLoteBtn();
            hideBaixarLoteBtn(); // Garante que esteja oculto
        }

        // Reexibe os controles de paginação e filtros se houver RESULTADOS FILTRADOS para exibir
        if (currentlyFilteredResults.length > 0) { // AGORA USA currentlyFilteredResults
            showPaginationControls();
            updatePaginationButtons(); // Atualiza estado dos botões
            showFilterSection(); // Reexibe filtros
        }
    }
}


// Função principal do botão de download em lote
export async function baixarGravacoesEmLote() {
    const { currentlyFilteredResults } = getState(); // AGORA usa currentlyFilteredResults
    const numGravacoes = currentlyFilteredResults.length;

    if (numGravacoes === 0) {
        showStatusWarning(MESSAGES.NO_RECORDINGS_TO_DOWNLOAD); // Use showStatusWarning para mensagens não críticas
        return;
    }

    // Move a desabilitação inicial dos botões para ANTES do confirm
    disableConsultarBtn();
    disableBaixarLoteBtn();
    hidePaginationControls(); // Oculta paginação
    hideFilterSection(); // Oculta filtros durante o download em lote


    const confirmarDownload = confirm(MESSAGES.DOWNLOAD_CONFIRM(numGravacoes));

    if (!confirmarDownload) {
        showStatusWarning(MESSAGES.DOWNLOAD_CANCELLED);
        // Reabilita botões e reexibe paginação/filtros APÓS o cancelamento
        enableConsultarBtn();
        if (currentlyFilteredResults.length > 0) { // AGORA USA currentlyFilteredResults
            enableBaixarLoteBtn();
            showPaginationControls();
            updatePaginationButtons();
            showFilterSection(); // Reexibe filtros
        } else {
            disableBaixarLoteBtn();
        }
        return; // Sai da função se cancelado
    }

    const convertCheckbox = document.getElementById('convertToMp3'); // Usa getElement? Sim, é melhor.
    // Importar CHECKBOX_CONVERT_TO_MP3_ID e getElement de domUtils
    // Reajustado para usar getElement
    const convertCheckboxElement = document.getElementById(CHECKBOX_CONVERT_TO_MP3_ID);
    const convertToMp3 = convertCheckboxElement ? convertCheckboxElement.checked : false;

    // Chama a função auxiliar que trata o fetch e o save
    // ENVIA AGORA currentlyFilteredResults
    fetchAndSaveZipFromBackend(currentlyFilteredResults, convertToMp3);
    // O finally dentro de fetchAndSaveZipFromBackend reabilitará os botões e reexibirá a paginação/filtros
}

// Função auxiliar para baixar o arquivo ZIP do backend e salvar
async function fetchAndSaveZipFromBackend(recordingsList, convertToMp3) {
    showStatusLoading(MESSAGES.DOWNLOAD_PROCESSING + ' (Lote)...');
    // Os botões já foram desabilitados em baixarGravacoesEmLote antes do confirm

    try {
        // Chama a função do backendApi para iniciar o download em lote
        console.log(`Solicitando download em lote (${recordingsList.length} gravações) para o backend.`);
        // ENVIA A LISTA JÁ FILTRADA
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
        const { currentlyFilteredResults } = getState();
        // Reabilita o botão de baixar lote apenas se houver gravações na lista filtrada
        if (currentlyFilteredResults.length > 0) { // AGORA USA currentlyFilteredResults
            enableBaixarLoteBtn();
            showBaixarLoteBtn(); // Garante que esteja visível
        } else {
            disableBaixarLoteBtn();
            hideBaixarLoteBtn(); // Garante que esteja oculto
        }

        // Reexibe os controles de paginação e filtros se houver RESULTADOS FILTRADOS para exibir
        if (currentlyFilteredResults.length > 0) { // AGORA USA currentlyFilteredResults
            showPaginationControls();
            updatePaginationButtons(); // Atualiza estado dos botões
            showFilterSection(); // Reexibe filtros
        }
    }
}