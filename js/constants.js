// --- Constantes ---
export const LOCAL_STORAGE_KEY = 'widevoiceConsultaConfig';
export const API_LIMIT_PER_PAGE = 500; // Limitação da API Widevoice
export const BACKEND_DOWNLOAD_URL = 'http://localhost:3000/download-batch'; // URL do seu Backend
export const MAX_PAGES_CONSULTATION = 200; // Limite máximo de páginas para consulta (segurança)


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
    DOWNLOAD_PROCESSING: 'Comunicando com o servidor para preparar o download em lote...',
    DOWNLOAD_STARTED: (filename) => `✅ Download do arquivo "${filename}" iniciado.`,
    DOWNLOAD_CANCELLED: 'Solicitação de download em lote cancelada pelo usuário.',
    NO_RECORDINGS_TO_DOWNLOAD: "Nenhuma gravação encontrada para baixar.",
    TEXT_BAIXAR_GRAVACAO: '🔊 Baixar',
    // ADICIONADO: Constante para a mensagem de resultados finais
    FINAL_RESULTS_DISPLAY: (count) => `✅ Busca finalizada. Total de resultados: ${count}`,
    DOWNLOAD_FAILED_DETAILS: (errorMsg, failedList) => {
        let msg = `❌ Erro no download em lote: ${errorMsg}`;
        if (failedList && Array.isArray(failedList) && failedList.length > 0) {
            msg += `\n\nDetalhes das falhas (${failedList.length} total):`;
            const displayLimit = 10;
            failedList.slice(0, displayLimit).forEach(item => {
                msg += `\n- ${item.url} (${item.error || 'Erro desconhecido'})`;
            });
            if (failedList.length > displayLimit) {
                msg += `\n... e mais ${failedList.length - displayLimit} falha(s). Verifique o console do backend (se tiver acesso) para a lista completa, ou o arquivo 'failed_downloads.log' dentro do ZIP (se foi gerado parcialmente).`;
            }
        }
        return msg;
    }
};