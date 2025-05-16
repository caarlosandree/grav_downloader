// --- Constantes ---\
export const LOCAL_STORAGE_KEY = 'widevoiceConsultaConfig';
export const API_LIMIT_PER_PAGE = 500; // Limitação da API Widevoice
export const BACKEND_DOWNLOAD_URL = 'http://localhost:3000/download-batch'; // URL do seu Backend para download em lote
// ADICIONADO: URL do seu Backend para download individual
export const BACKEND_DOWNLOAD_SINGLE_URL = 'http://localhost:3000/download-single'; // Ajuste a porta se necessário
export const MAX_PAGES_CONSULTATION = 200; // Limite máximo de páginas para consulta (segurança)

// ADICIONADO: ID do checkbox de conversão
export const CHECKBOX_CONVERT_TO_MP3_ID = 'convertToMp3';


// --- Constantes para Mensagens ---\
export const MESSAGES = {
    EMPTY_FIELDS: '⚠️ Preencha todos os campos antes de consultar.',
    INVALID_URL_BASE: '⚠️ Formato de URL do servidor inválido. Use apenas o domínio ou endereço IP (ex: seudominio.com.br ou 192.168.1.1).',
    INTERNAL_DATE_FORMAT_ERROR: '⚠️ Erro interno na formatação da Data. Verifique o valor selecionado.',
    DATE_RANGE_ERROR: '⚠️ A Data Fim não pode ser anterior à Data Início.',
    LOADING: '🔄 Carregando...',
    NO_RESULTS: '⚠️ Nenhum resultado encontrado para o período informado.',
    NO_RECORDINGS_FOUND_FILTERED: '⚠️ Nenhuma gravação encontrada no período informado.',
    FETCH_ERROR: '❌ Erro na requisição: ', // Erro na comunicação FE -> API Widevoice
    AUTH_ERROR: '❌ Erro de autenticação. Verifique login e token.',
    CLIENT_ERROR: '❌ Erro na requisição cliente: ',
    SERVER_ERROR: '❌ Erro no servidor da API: ',

    DOWNLOAD_CONFIRM: (count) => `Confirmar o download de ${count} gravação(ões)?`,
    DOWNLOAD_CANCELLED: 'Download cancelado.',
    NO_RECORDINGS_TO_DOWNLOAD: '⚠️ Nenhuma gravação disponível para download com os filtros atuais.',
    DOWNLOAD_PROCESSING: '📦 Processando download...',
    // Mensagem de início de download, pode ser mais genérica ou específica no saveBlobAsFile
    DOWNLOAD_STARTED: (filename) => `✅ Download "${filename}" iniciado.`,
    DOWNLOAD_FAILED: '❌ Falha no download.',
    // Mensagem detalhada para falhas no lote
    DOWNLOAD_FAILED_DETAILS: (errorMsg, failedDownloads, failedConversions) => {
        let msg = `❌ Falha no download em lote: ${errorMsg}`;
        if (failedDownloads && Array.isArray(failedDownloads) && failedDownloads.length > 0) {
            msg += `\n\n--- Downloads Falhos (${failedDownloads.length}) ---\n`;
            const displayLimit = 5; // Limita a exibição direta para não poluir muito
            failedDownloads.slice(0, displayLimit).forEach(item => {
                msg += `\n- ${item.url} (${item.error || 'Erro desconhecido'})`;
            });
            if (failedDownloads.length > displayLimit) {
                msg += `\n... e mais ${failedDownloads.length - displayLimit} falha(s) de download.`;
            }
        }
        if (failedConversions && Array.isArray(failedConversions) && failedConversions.length > 0) {
            msg += `\n\n--- Conversões Falhas (${failedConversions.length}) ---\n`;
            const displayLimit = 5;
            failedConversions.slice(0, displayLimit).forEach(item => {
                msg += `\n- ${item.url} (${item.error || 'Erro desconhecido'})`;
            });
            if (failedConversions.length > displayLimit) {
                msg += `\n... e mais ${failedConversions.length - displayLimit} falha(s) de conversão.`;
            }
        }

        // Mensagem final sobre o relatório no ZIP se houve falhas
        if (failedDownloads?.length > 0 || failedConversions?.length > 0) {
            msg += `\n\nVerifique o arquivo 'processamento_relatorio.log' dentro do arquivo ZIP baixado para um relatório completo das falhas.`;
        }


        return msg;
    },

    // ADICIONADO: Função para formatar a parte da mensagem final sobre o total de resultados brutos
    FINAL_RESULTS_DISPLAY: (totalRaw) => `Total de resultados brutos da API: ${totalRaw}.`
};