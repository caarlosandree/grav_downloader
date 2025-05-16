// js/apiService.js

import { MESSAGES, API_LIMIT_PER_PAGE, MAX_PAGES_CONSULTATION } from './constants.js';
import { fetchConsultationPage } from './widevoiceApi.js'; // Importa a função para buscar uma página

// Função para buscar TODOS os dados da API WideVoice, lidando com o fatiamento temporal
// Esta função encapsula a lógica do loop e chama fetchConsultationPage repetidamente.
// Recebe callbacks para atualizar o status no frontend.
export async function fetchAllWidevoiceData(urlBase, login, token, datainicioApi, datafimApi, statusCallbacks) {
    let allFetchedResults = [];
    // Precisamos de objetos Date para a comparação no loop
    const originalSearchEndObj = new Date(datafimApi.replace(' ', 'T'));
    let currentSearchStartObj = new Date(datainicioApi.replace(' ', 'T'));
    let pageAttempt = 1; // Representa a tentativa/fatia número para feedback e limite

    statusCallbacks.showStatusLoading(MESSAGES.LOADING + ' (Iniciando busca por fatiamento temporal...)');

    try {
        // Loop de busca baseado em data/hora. Continua enquanto o início da busca atual for menor ou igual ao fim original.
        while (currentSearchStartObj <= originalSearchEndObj && pageAttempt <= MAX_PAGES_CONSULTATION) {

            // Verifica se o limite máximo de páginas foi atingido como salvaguarda
            if (pageAttempt > MAX_PAGES_CONSULTATION) {
                console.warn(`Limite máximo de páginas (${MAX_PAGES_CONSULTATION}) atingido. Interrompendo a busca.`);
                // Podemos lançar um erro ou adicionar uma mensagem de aviso no final
                statusCallbacks.showStatusWarning(`${MESSAGES.LOADING} Limite máximo de páginas (${MAX_PAGES_CONSULTATION}) atingido. A busca pode estar incompleta.`);
                // Avança o currentSearchStartObj para garantir que o loop termine na próxima checagem
                currentSearchStartObj = new Date(originalSearchEndObj.getTime() + 1000);
                continue; // Pula para a próxima iteração, que deve ser a última

            }

            // Converte o início da busca atual (Date object) para o formato da API (YYYY-MM-DD HH:mm:ss)
            const currentSliceStartApi = `${currentSearchStartObj.getFullYear()}-${String(currentSearchStartObj.getMonth() + 1).padStart(2, '0')}-${String(currentSearchStartObj.getDate()).padStart(2, '0')} ${String(currentSearchStartObj.getHours()).padStart(2, '0')}:${String(currentSearchStartObj.getMinutes()).padStart(2, '0')}:${String(currentSearchStartObj.getSeconds()).padStart(2, '0')}`;

            // O fim da requisição para CADA fatia é sempre a datafim original da consulta.
            // A API Widevoice parece filtrar pelo range de datas INICIAL e depois usa offset/limit DENTRO desse range.
            // A lógica de fatiamento temporal que você implementou avança o `datainicio` do *próximo* request,
            // o que parece ser a abordagem correta se a API tem limite de resultados POR REQUISIÇÃO
            // e não por range total.
            // Vamos manter a lógica de passar o range COMPLETO (datainicioApi original e datafimApi original)
            // para fetchConsultationPage, mas avançar `currentSearchStartObj` baseado no timestamp do último item.
            // A requisição da API será: `datainicio=currentSliceStartApi`, `datafim=datafimApiOriginal`.
            // Usamos `offset=0` e `limit=API_LIMIT_PER_PAGE` em cada requisição da fatia temporal.

            statusCallbacks.showStatusLoading(`${MESSAGES.LOADING} (Buscando faixa a partir de ${currentSliceStartApi} até ${datafimApi} - tentativa ${pageAttempt}, Total de resultados brutos atuais: ${allFetchedResults.length})...`);


            // Fetch ONE page for the current time slice, starting from `currentSliceStartApi`
            const pageData = await fetchConsultationPage(
                urlBase,
                login,
                token,
                currentSliceStartApi, // Usa o início da fatia temporal atual
                datafimApi,   // Usa o fim original da consulta
                0, // Sempre offset 0 para cada nova fatia temporal
                API_LIMIT_PER_PAGE,
                pageAttempt // Passa attempt number para feedback
            );

            if (!pageData || pageData.length === 0) {
                console.log(`API retornou 0 resultados para faixa a partir de ${currentSliceStartApi} até ${datafimApi}.`);
                // Se não retornou dados, avança o currentSearchStartObj para garantir que o loop termine
                // Avançamos para 1 segundo após a datafim original para parar o loop principal.
                currentSearchStartObj = new Date(originalSearchEndObj.getTime() + 1000);
                console.log("Avançando início da busca além da data fim original, pois não retornou dados.");
                break; // Sai do loop principal

            }

            // Adiciona resultados obtidos nesta fatia
            allFetchedResults = allFetchedResults.concat(pageData);
            console.log(`Faixa a partir de ${currentSliceStartApi} retornou ${pageData.length} resultados. Total acumulado: ${allFetchedResults.length}`);

            // --- Lógica para determinar o início da PRÓXIMA fatia temporal ---
            // Encontra o registro mais recente entre os resultados RETORNADOS NESTA REQUISIÇÃO
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
                    // Fallback: se não tem datahora válida, avança o loop para terminar
                    currentSearchStartObj = new Date(originalSearchEndObj.getTime() + 1000);
                } else {
                    const latestDate = new Date(latestDatahoraStr.replace(' ', 'T'));

                    if (isNaN(latestDate.getTime())) {
                        console.warn(`Datahora ('${latestDatahoraStr}') do último registro é inválida. Avançando o início da próxima busca para 1s após a data fim original como fallback.`);
                        // Fallback se a data do último registro for inválida
                        currentSearchStartObj = new Date(originalSearchEndObj.getTime() + 1000);
                    } else {
                        // Define o início da próxima busca como 1 segundo após a data/hora do registro mais recente
                        currentSearchStartObj = new Date(latestDate.getTime() + 1000);
                        console.log(`Próxima fatia temporal inicia em ${currentSearchStartObj.toLocaleString()}.`);
                    }
                }

            } catch (dateError) {
                console.error(`Erro ao determinar o início da próxima faixa de busca na tentativa ${pageAttempt}: ${dateError.message}`, dateError);
                statusCallbacks.showStatusError(`❌ Erro interno ao processar data do último registro na tentativa ${pageAttempt}: ${dateError.message}. Busca pode estar incompleta.`);
                // Em caso de erro no processamento da data, avança para garantir que o loop não se torne infinito
                currentSearchStartObj = new Date(originalSearchEndObj.getTime() + 1000);
                break; // Aborta a busca em caso de erro fatal no processamento da data
            }


            // Pequena pausa entre as requisições para não sobrecarregar a API
            await new Promise(resolve => setTimeout(resolve, 50));

            // Incrementa contador de tentativas
            pageAttempt++;


        } // Fim do loop while (currentSearchStartObj <= originalSearchEndObj && pageAttempt <= MAX_PAGES_CONSULTATION)


        if (pageAttempt > MAX_PAGES_CONSULTATION) {
            console.warn(`Busca encerrada: Limite máximo de páginas/tentativas (${MAX_PAGES_CONSULTATION}) atingido.`);
            // Mensagem de aviso já foi exibida dentro do loop

        } else if (currentSearchStartObj > originalSearchEndObj) {
            console.log("Busca concluída: Intervalo temporal totalmente coberto.");
        }


        console.log(`Busca fatiada concluída. Total final de resultados brutos da API: ${allFetchedResults.length}`);
        return allFetchedResults; // Retorna o array completo de resultados brutos

    } catch (error) {
        console.error('Erro durante a busca fatiada da API WideVoice:', error);
        // Re-lança o erro para o chamador (app.js) lidar no seu bloco catch
        throw error;
    }
}