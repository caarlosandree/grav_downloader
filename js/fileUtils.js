import { showStatusSuccess, showStatusError } from './domUtils.js';
import { MESSAGES } from './constants.js';

// Função para salvar um Blob como arquivo usando FileSaver.js ou fallback
export function saveBlobAsFile(blob, responseHeaders) {
    // OBTEM O NOME DO ARQUIVO DO CABEÇALHO Content-Disposition
    const contentDisposition = responseHeaders.get('Content-Disposition');
    let filename = 'gravações_download.zip'; // Nome padrão

    if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-8'')?([^"\s]+)['"]?$/i);

        if (filenameMatch && filenameMatch[1]) {
            filename = decodeURIComponent(filenameMatch[1]);
            filename = filename.replace(/[<>:"\/\\|?*]/g, '_');
        } else {
            const simpleFilenameMatch = contentDisposition.match(/filename="([^"]+)"/);
            if (simpleFilenameMatch && simpleFilenameMatch[1]) {
                filename = simpleFilenameMatch[1];
            }
        }
    }
    console.log(`Nome do arquivo extraído do cabeçalho: ${filename}`);


    // ** USAR FileSaver.js PARA SALVAR O BLOB COMO ARQUIVO **
    // Verifica se saveAs está disponível globalmente ou pode ser importado se estiver como módulo
    if (typeof saveAs === 'function') { // Assuming saveAs is globally available via script tag
        console.log(`Usando FileSaver.js para salvar o arquivo: ${filename}`);
        saveAs(blob, filename); // Dispara o salvamento

        showStatusSuccess(MESSAGES.DOWNLOAD_STARTED(filename));

    } else {
        // ** FALLBACK: USAR URL.createObjectURL SE FileSaver.js NÃO ESTIVER DISPONÍVEL **
        console.warn("FileSaver.js não encontrado (ou não expôs saveAs globalmente). Usando URL.createObjectURL como fallback.");
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showStatusSuccess(MESSAGES.DOWNLOAD_STARTED(filename) + ' (via fallback)');
        }, 100);
    }
}