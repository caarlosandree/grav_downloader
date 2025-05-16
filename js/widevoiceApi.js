// js/widevoiceApi.js
import { MESSAGES, API_LIMIT_PER_PAGE } from './constants.js';
// NÃO PRECISA IMPORTAR showStatusError AQUI, APISERVICE PASSA AS CALLBACKS
// import { showStatusError } from './uiManager.js';


// Função para buscar uma única página de resultados da API Widevoice
// Exportada para ser usada pelo apiService
export async function fetchConsultationPage(urlBase, login, token, datainicioApi, datafimApi, offset, limit, page) {
    const url = `https://${urlBase}/api.php?acao=statusreport&login=${login}&token=${token}&offset=${offset}&limit=${limit}`;
    const payload = { datainicio: datainicioApi, datafim: datafimApi };

    console.log(`Workspaceing API page ${page}: ${url} with payload ${JSON.stringify(payload)}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let errorMessage = `${MESSAGES.FETCH_ERROR} ${response.status} ao buscar página ${page}`;
            if (response.status === 401) {
                errorMessage = MESSAGES.AUTH_ERROR;
            } else if (response.status >= 400 && response.status < 500) {
                errorMessage = `${MESSAGES.CLIENT_ERROR} Status ${response.status} ao buscar página ${page}. Verifique os dados informados.`;
            } else if (response.status >= 500) {
                errorMessage = `${MESSAGES.SERVER_ERROR} Status ${response.status} ao buscar página ${page}. Tente novamente mais tarde.`;
            }
            // Tenta ler o corpo da resposta para detalhes adicionais
            try {
                const errorDetails = await response.text(); // Tenta ler como texto caso não seja JSON válido
                if (errorDetails) {
                    errorMessage += ` - Detalhes: ${errorDetails.substring(0, 200)}...`; // Limita o tamanho dos detalhes
                }
            } catch (readError) {
                console.warn(`Não foi possível ler o corpo da resposta de erro da API (página ${page}):`, readError);
            }

            throw new Error(errorMessage);
        }

        // response.ok é true (status 200-299)
        const text = await response.text(); // Leia a resposta como texto primeiro

        // Tente parsear JSON APENAS se o texto não estiver vazio
        let data = null;
        if (text) {
            try {
                data = JSON.parse(text); // Tente parsear JSON
            } catch (jsonError) {
                console.warn(`Não foi possível parsear resposta JSON da API (página ${page}). Resposta: "${text.substring(0, 200)}..."`, jsonError);
                // Se não for JSON, trate como resposta inválida mas não necessariamente erro fatal
                // Dependendo da API, uma resposta não-JSON 200 OK pode significar "sem dados" ou erro estrutural
                // Se a API SEMPRE retorna JSON (array), então não parsear significa erro.
                // Pelo erro anterior ("Esperado array, recebeu object. Resposta: null"), parece que
                // às vezes retorna null ou algo que JSON.parse transforma em null/object.
                // Vamos tratar null/não-array como array vazio SE response.ok for true.
            }
        } else {
            console.log(`Resposta vazia da API para página ${page}, status ${response.status}. Tratando como array vazio.`);
            // Resposta vazia com status OK também pode significar sem dados
        }


        // *** CORREÇÃO: TRATAR RESPOSTAS NÃO-ARRAY / NULL QUANDO response.ok É TRUE ***
        // Se response.ok for true, mas data não for um array (incluindo data === null), retorne um array vazio.
        if (!Array.isArray(data)) {
            console.warn(`Resposta da API para página ${page} não é um array (tipo: ${typeof data}, valor: ${JSON.stringify(data)}). Tratando como array vazio.`);
            return []; // Retorna um array vazio para indicar que não há resultados
        }
        // *** FIM DA CORREÇÃO ***


        return data; // Retorna o array de resultados

    } catch (error) {
        console.error(`Erro durante o fetch da API Widevoice (página ${page}):`, error);
        // Re-lança o erro para ser tratado pelo chamador (apiService)
        throw error;
    }
}

// Exporta a função principal
// NOTA: fetchAllWidevoiceData está agora no apiService.js
// O widevoiceApi.js apenas exporta fetchConsultationPage
// export { fetchConsultationPage }; // Já exportado na declaração da função acima