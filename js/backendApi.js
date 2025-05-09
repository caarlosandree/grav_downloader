import { BACKEND_DOWNLOAD_URL } from './constants.js';

// Função para enviar a lista de gravações para o backend e obter a resposta (Blob ou JSON de erro)
export async function fetchBackendZip(recordingsList) {
    const backendUrl = BACKEND_DOWNLOAD_URL;

    const response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(recordingsList),
    });

    // Não tratamos response.ok aqui, apenas retornamos a resposta.
    // O tratamento de response.ok (sucesso vs erro) será feito no caller (app.js).
    return response;
}