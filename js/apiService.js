// js/apiService.js

import { MESSAGES, API_LIMIT_PER_PAGE, MAX_PAGES_CONSULTATION } from './constants.js';
import { fetchConsultationPage } from './widevoiceApi.js'; // Importa a função para buscar uma página

export async function fetchAllWidevoiceData(urlBase, login, token, datainicioApi, datafimApi, statusCallbacks) {
    let allFetchedResults = [];
    const originalSearchEndObj = new Date(datafimApi.replace(' ', 'T'));
    let currentSearchStartObj = new Date(datainicioApi.replace(' ', 'T'));
    let pageAttempt = 1;

    statusCallbacks.showStatusLoading(MESSAGES.LOADING + ' (Iniciando busca por fatiamento temporal...)');

    try {
        while (currentSearchStartObj <= originalSearchEndObj && pageAttempt <= MAX_PAGES_CONSULTATION) {
            const currentSliceStartApi = `${currentSearchStartObj.getFullYear()}-${String(currentSearchStartObj.getMonth() + 1).padStart(2, '0')}-${String(currentSearchStartObj.getDate()).padStart(2, '0')} ${String(currentSearchStartObj.getHours()).padStart(2, '0')}:${String(currentSearchStartObj.getMinutes()).padStart(2, '0')}:${String(currentSearchStartObj.getSeconds()).padStart(2, '0')}`;

            statusCallbacks.showStatusLoading(`${MESSAGES.LOADING} (Buscando faixa a partir de ${currentSliceStartApi} até ${datafimApi} - tentativa ${pageAttempt}, Total de resultados brutos atuais: ${allFetchedResults.length})...`);

            const pageData = await fetchConsultationPage(
                urlBase,
                login,
                token,
                currentSliceStartApi,
                datafimApi,
                0,
                API_LIMIT_PER_PAGE,
                pageAttempt
            );

            if (!pageData || pageData.length === 0) {
                console.log(`API retornou 0 resultados para faixa a partir de ${currentSliceStartApi} até ${datafimApi}.`);
                currentSearchStartObj = new Date(originalSearchEndObj.getTime() + 1000);
                break;
            }

            // <-- Limpeza essencial aqui:
            for (const item of pageData) {
                if (item.datahora) {
                    item.datahora = item.datahora.replace(/\s+/g, ' ').trim();
                }
            }

            allFetchedResults = allFetchedResults.concat(pageData);
            console.log(`Faixa a partir de ${currentSliceStartApi} retornou ${pageData.length} resultados. Total acumulado: ${allFetchedResults.length}`);

            try {
                const latestRecord = pageData.reduce((latest, current) => {
                    if (!latest || (current.datahora && current.datahora > latest.datahora)) {
                        return current;
                    }
                    return latest;
                }, null);

                const latestDatahoraStr = latestRecord?.datahora;

                if (!latestDatahoraStr) {
                    console.warn(`API retornou ${pageData.length} resultados, mas nenhum registro tem 'datahora' válida. Avançando o início da próxima busca para 1s após a data fim original como fallback.`);
                    currentSearchStartObj = new Date(originalSearchEndObj.getTime() + 1000);
                } else {
                    const cleanedDateStr = latestDatahoraStr.replace(/\s+/g, ' ').trim().replace(' ', 'T');
                    const latestDate = new Date(cleanedDateStr);

                    if (isNaN(latestDate.getTime())) {
                        console.warn(`Datahora ('${latestDatahoraStr}') do último registro é inválida. Avançando o início da próxima busca para 1s após a data fim original como fallback.`);
                        currentSearchStartObj = new Date(originalSearchEndObj.getTime() + 1000);
                    } else {
                        currentSearchStartObj = new Date(latestDate.getTime() + 1000);
                        console.log(`Próxima fatia temporal inicia em ${currentSearchStartObj.toLocaleString()}.`);
                    }
                }

            } catch (dateError) {
                console.error(`Erro ao determinar o início da próxima faixa de busca na tentativa ${pageAttempt}: ${dateError.message}`, dateError);
                statusCallbacks.showStatusError(`❌ Erro interno ao processar data do último registro na tentativa ${pageAttempt}: ${dateError.message}. Busca pode estar incompleta.`);
                currentSearchStartObj = new Date(originalSearchEndObj.getTime() + 1000);
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 50));
            pageAttempt++;
        }

        if (pageAttempt > MAX_PAGES_CONSULTATION) {
            console.warn(`Busca encerrada: Limite máximo de páginas/tentativas (${MAX_PAGES_CONSULTATION}) atingido.`);
        } else if (currentSearchStartObj > originalSearchEndObj) {
            console.log("Busca concluída: Intervalo temporal totalmente coberto.");
        }

        console.log(`Busca fatiada concluída. Total final de resultados brutos da API: ${allFetchedResults.length}`);
        return allFetchedResults;

    } catch (error) {
        console.error('Erro durante a busca fatiada da API WideVoice:', error);
        throw error;
    }
}