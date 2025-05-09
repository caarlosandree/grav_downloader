// --- Constantes ---
export const LOCAL_STORAGE_KEY = 'widevoiceConsultaConfig';
export const API_LIMIT_PER_PAGE = 500; // Limitação da API Widevoice
export const BACKEND_DOWNLOAD_URL = 'http://localhost:3000/download-batch'; // URL do seu Backend
export const MAX_PAGES_CONSULTATION = 200; // Limite máximo de páginas para consulta (segurança)

// ADICIONADO: ID do checkbox de conversão
export const CHECKBOX_CONVERT_TO_MP3_ID = 'convertToMp3';


// --- Constantes para Mensagens ---
export const MESSAGES = {
    EMPTY_FIELDS: '⚠️ Preencha todos os campos antes de consultar.',
    INVALID_URL_BASE: '⚠️ Formato de URL do servidor inválido. Use apenas o domínio ou endereço IP (ex: seudominio.com.br ou 192.168.1.1).',
    INTERNAL_DATE_FORMAT_ERROR: '⚠️ Erro interno na formatação da Data. Verifique o valor selecionado.',
    DATE_RANGE_ERROR: '⚠️ A Data Fim não pode ser anterior à Data Início.',
    LOADING: '🔄 Carregando...',
    NO_RESULTS: '⚠️ Nenhum resultado encontrado para o período informado.',
    NO_RECORDINGS_FOUND_FILTERED: '⚠️ Nenhuma gravação encontrada no período informado.',
    FETCH_ERROR: '❌ Erro na requisição: ', // Erro na comunicação FE -> API Widevoice
    AUTH_ERROR: 'Erro de autenticação. Verifique seu login e token.', // Erro da API Widevoice
    CLIENT_ERROR: 'Erro na requisição: ', // Erros 4xx da API Widevoice
    SERVER_ERROR: 'Erro do servidor: ', // Erros 5xx da API Widevoice
    DOWNLOAD_CONFIRM: (count) => `Você está prestes a solicitar ao servidor o download e zip de ${count} gravação(ões). Deseja continuar?`,
    // ATUALIZADO: Mensagem de processamento do download para incluir conversão
    DOWNLOAD_PROCESSING: 'Comunicando com o servidor para preparar o download e conversão (se solicitado) em lote...',
    DOWNLOAD_STARTED: (filename) => `✅ Download do arquivo "${filename}" iniciado.`,
    DOWNLOAD_CANCELLED: 'Solicitação de download em lote cancelada pelo usuário.',
    NO_RECORDINGS_TO_DOWNLOAD: "Nenhuma gravação encontrada para baixar.",
    TEXT_BAIXAR_GRAVACAO: '🔊 Baixar',
    FINAL_RESULTS_DISPLAY: (count) => `✅ Busca finalizada. Total de resultados: ${count}`,
    // ATUALIZADO: Mensagem de erro detalhada para incluir falhas de conversão
    DOWNLOAD_FAILED_DETAILS: (errorMsg, failedDownloadsList, failedConversionsList) => {
        let msg = `❌ Erro no download em lote: ${errorMsg}`;

        if (failedDownloadsList && Array.isArray(failedDownloadsList) && failedDownloadsList.length > 0) {
            msg += `\n\n--- Downloads Falhos (${failedDownloadsList.length}) ---\n`;
            const displayLimit = 5; // Limita a exibição direta para não poluir muito
            failedDownloadsList.slice(0, displayLimit).forEach(item => {
                msg += `\n- ${item.url} (${item.error || 'Erro desconhecido'})`;
            });
            if (failedDownloadsList.length > displayLimit) {
                msg += `\n... e mais ${failedDownloadsList.length - displayLimit} falha(s) de download.`;
            }
        }

        if (failedConversionsList && Array.isArray(failedConversionsList) && failedConversionsList.length > 0) {
            msg += `\n\n--- Conversões Falhas (${failedConversionsList.length}) ---\n`;
            const displayLimit = 5;
            failedConversionsList.slice(0, displayLimit).forEach(item => {
                msg += `\n- ${item.url} (${item.error || 'Erro desconhecido'})`;
            });
            if (failedConversionsList.length > displayLimit) {
                msg += `\n... e mais ${failedConversionsList.length - displayLimit} falha(s) de conversão.`;
            }
        }

        // Mensagem final sobre o relatório no ZIP
        if (failedDownloadsList?.length > 0 || failedConversionsList?.length > 0) {
            msg += `\n\nVerifique o arquivo 'processamento_relatorio.log' dentro do ZIP (se foi gerado parcialmente) para mais detalhes, ou o console do backend (se tiver acesso).`;
        }


        return msg;
    }
};