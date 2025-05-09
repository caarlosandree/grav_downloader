import { MESSAGES } from './constants.js';

// Função para buscar uma única página de resultados da API Widevoice
export async function fetchConsultationPage(urlBase, login, token, datainicioApi, datafimApi, offset, limit, page) {
    const url = `https://${urlBase}/api.php?acao=statusreport&login=${login}&token=${token}&offset=${offset}&limit=${limit}`;
    const payload = { datainicio: datainicioApi, datafim: datafimApi };

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
            errorMessage = `${MESSAGES.CLIENT_ERROR} ${response.status}. Verifique os dados informados.`;
        } else if (response.status >= 500) {
            errorMessage = `${MESSAGES.SERVER_ERROR} ${response.status}. Tente novamente mais tarde.`;
        }
        try {
            const errorData = await response.json();
            if (errorData && (errorData.message || errorData.error)) {
                errorMessage += ` - Detalhes: ${errorData.message || errorData.error}`;
            }
        } catch (jsonError) {
            console.warn(`Não foi possível parsear JSON de erro do corpo da resposta da API (página ${page}):`, jsonError);
        }
        throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
        throw new Error(`Resposta inesperada da API ao buscar página ${page}. Esperado um array, mas recebeu: ${typeof data}. Resposta: ${JSON.stringify(data)}`);
    }

    return data; // Retorna o array de resultados da página
}