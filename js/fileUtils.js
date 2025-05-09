// js/fileUtils.js
import { showStatusSuccess, showStatusError } from './domUtils.js';
import { MESSAGES } from './constants.js';
// REMOVIDO: import * as path from 'path-browserify'; // Não precisamos mais disto

// Função auxiliar para obter a extensão de um nome de arquivo
function getFileExtension(filename) {
    const dotIndex = filename.lastIndexOf('.');
    // Se não houver ponto, ou o ponto for o primeiro caractere, não há extensão
    if (dotIndex < 1) {
        return '';
    }
    return filename.substring(dotIndex).toLowerCase();
}

// Função auxiliar para obter o nome base de um nome de arquivo (sem extensão)
function getFileNameWithoutExtension(filename) {
    const dotIndex = filename.lastIndexOf('.');
    // Se não houver ponto, ou o ponto for o primeiro caractere, o nome inteiro é o nome base
    if (dotIndex < 1) {
        return filename;
    }
    return filename.substring(0, dotIndex);
}


// Função para salvar um Blob como arquivo usando FileSaver.js ou fallback
// Recebe o Blob e os Headers da resposta
export function saveBlobAsFile(blob, responseHeaders) {
    const contentDisposition = responseHeaders.get('Content-Disposition');
    let filename = null; // Começa como null
    let isIndividualDownload = false; // Flag para saber se é download individual

    // Podemos inferir se é download individual se o Content-Type for audio/mpeg
    const contentType = responseHeaders.get('Content-Type');
    if (contentType && contentType.includes('audio/mpeg')) {
        isIndividualDownload = true;
        // Nome padrão para download individual caso a EXTRAÇÃO do cabeçalho falhe
        filename = 'gravacao_convertida.mp3';
    } else {
        // Nome padrão para download em lote (ZIP) caso a EXTRAÇÃO do cabeçalho falhe
        filename = 'gravações_lote_download.zip';
    }

    console.log(`Content-Disposition header: ${contentDisposition}`);
    console.log(`Content-Type header: ${contentType}`);


    if (contentDisposition) {
        // Tenta extrair o nome do arquivo usando regex, suportando filenames com e sem UTF-8''
        // Esta regex tenta ser mais abrangente para diferentes formatos
        const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:utf-8'')?([^;"]+)/i);

        if (filenameMatch && filenameMatch[1]) {
            try {
                // Tenta decodificar o nome do arquivo se estiver no formato UTF-8
                // O grupo de captura já deve ser a parte decodificável ou o nome simples
                // Substitui '+' por espaço antes de decodificar, comum em nomes de URL
                filename = decodeURIComponent(filenameMatch[1].replace(/\+/g, ' '));
                console.log(`Nome extraído e decodificado do cabeçalho: ${filename}`);
            } catch (e) {
                // Se a decodificação falhar, usa o nome bruto capturado
                filename = filenameMatch[1];
                console.warn(`Falha ao decodificar nome do arquivo do cabeçalho (${filenameMatch[1]}). Usando nome bruto.`, e);
            }

            // Limpa caracteres inválidos do nome do arquivo para evitar problemas no SO
            filename = filename.replace(/[<>:"\/\\|?*]/g, '_');
            console.log(`Nome do arquivo após extração e limpeza: ${filename}`);

        } else {
            // Se nenhuma regex de 'filename*' ou 'filename' funcionou, o nome padrão (já definido no início) será usado.
            console.warn("Não foi possível extrair o nome do arquivo do Content-Disposition usando regex. Usando nome padrão de fallback.");
            // O 'filename' já tem o valor padrão ('gravacao_convertida.mp3' ou 'gravações_lote_download.zip') definido anteriormente
        }
    } else {
        // Se Content-Disposition não existe, usa o nome padrão
        console.warn("Cabeçalho Content-Disposition não encontrado. Usando nome padrão de fallback.");
        // O 'filename' já tem o valor padrão definido no início
    }

    // ** CORREÇÃO FINAL: Garante a extensão correta usando manipulação de strings **
    // Esta lógica verifica o tipo de download esperado e ajusta a extensão
    // apenas se o nome extraído/padrão não tiver a extensão correta.
    const expectedExtension = isIndividualDownload ? '.mp3' : '.zip';
    const currentExtension = getFileExtension(filename); // Usa a função auxiliar
    const nameWithoutCurrentExt = getFileNameWithoutExtension(filename); // Usa a função auxiliar


    if (currentExtension !== expectedExtension) {
        console.warn(`Extensão atual (${currentExtension}) não corresponde à esperada (${expectedExtension}). Ajustando nome.`);
        filename = `${nameWithoutCurrentExt}${expectedExtension}`;
        console.log(`Nome do arquivo ajustado pela extensão: ${filename}`);
    } else {
        console.log(`Extensão do arquivo (${currentExtension}) corresponde à esperada. Nome final mantido.`);
    }


    console.log(`Nome FINAL determinado para salvar: ${filename}`);


    // ** USAR FileSaver.js PARA SALVAR O BLOB COMO ARQUIVO **
    // Verifica se saveAs está disponível globalmente
    if (typeof saveAs === 'function') {
        console.log(`Usando FileSaver.js para salvar o arquivo: ${filename}`);
        saveAs(blob, filename); // Dispara o salvamento

        // Mensagem de sucesso mais específica
        if (isIndividualDownload) {
            showStatusSuccess(`✅ Download da gravação "${filename}" iniciado.`);
        } else {
            showStatusSuccess(MESSAGES.DOWNLOAD_STARTED(filename));
        }


    } else {
        // ** FALLBACK: USAR URL.createObjectURL SE FileSaver.js NÃO ESTIVER DISPONÍVEL **
        console.warn("FileSaver.js não encontrado (ou não expôs saveAs globalmente). Usando URL.createObjectURL como fallback.");
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename; // Define o nome de download
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url); // Libera o objeto URL
            // Mensagem de sucesso mais específica
            if (isIndividualDownload) {
                showStatusSuccess(`✅ Download da gravação "${filename}" iniciado (via fallback).`);
            } else {
                showStatusSuccess(MESSAGES.DOWNLOAD_STARTED(filename) + ' (via fallback)');
            }
        }, 100); // Pequeno delay para garantir que o clique funcione
    }
    // Retorna o nome final determinado
    return filename;
}