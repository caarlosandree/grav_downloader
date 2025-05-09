import { BACKEND_DOWNLOAD_URL } from './constants.js';

// Função para enviar a lista de gravações e a flag de conversão para o backend
export async function fetchBackendZip(recordingsList, convertToMp3) { // Aceita a flag convertToMp3
    const backendUrl = BACKEND_DOWNLOAD_URL;

    const response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        // Envia um objeto que inclui a lista de gravações E a flag de conversão
        body: JSON.stringify({ recordings: recordingsList, convertToMp3: convertToMp3 }),
    });

    // Não tratamos response.ok aqui, apenas retornamos a resposta.
    // O tratamento de response.ok (sucesso vs erro) será feito no caller (app.js).
    return response;
}