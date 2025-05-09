// backend/converter.js
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
// Importa o instalador do FFmpeg e obtém o caminho para o executável
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path; // <-- Importação do caminho do FFmpeg do pacote

// Função para converter um arquivo de áudio usando FFmpeg
// Retorna uma Promise que resolve com o caminho do arquivo MP3 gerado,
// ou rejeita em caso de erro.
async function convertGsmToMp3(inputGsmPath, outputMp3Path) {
    return new Promise((resolve, reject) => {
        // Verifica se o arquivo de entrada existe
        if (!fs.existsSync(inputGsmPath)) {
            return reject(new Error(`Arquivo de entrada não encontrado: ${inputGsmPath}`));
        }

        // Garante que o diretório de saída exista
        const outputDir = path.dirname(outputMp3Path);
        fs.ensureDir(outputDir)
            .then(() => {
                // Comando FFmpeg:
                // -i <inputGsmPath> : Define o arquivo de entrada
                // -acodec libmp3lame : Define o codec de áudio de saída como MP3 (libmp3lame)
                // -ab 128k : Define o bitrate do áudio de saída (128 kbps é comum para MP3)
                // -ar 44100 : Define a taxa de amostragem (44.1 kHz é comum)
                // -y : Sobrescreve o arquivo de saída se ele já existir
                // <outputMp3Path> : Define o arquivo de saída
                const ffmpegArgs = [
                    '-i', inputGsmPath,
                    '-acodec', 'libmp3lame',
                    '-ab', '128k',
                    '-ar', '44100',
                    '-y', // Sobrescreve o arquivo de saída sem perguntar
                    outputMp3Path
                ];

                console.log(`Usando FFmpeg de: ${ffmpegPath}`); // Opcional: loga o caminho do FFmpeg
                console.log(`Executando FFmpeg com argumentos: ${ffmpegArgs.join(' ')}`); // Loga os argumentos
                console.log(`Executando FFmpeg para converter ${path.basename(inputGsmPath)} para ${path.basename(outputMp3Path)}`);

                // Executa o comando FFmpeg usando o caminho obtido do pacote
                const ffmpegProcess = execFile(ffmpegPath, ffmpegArgs, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Erro na conversão FFmpeg de ${path.basename(inputGsmPath)}:`, error);
                        console.error('FFmpeg stderr:', stderr);
                        // Mensagem de erro ajustada para refletir que o FFmpeg foi encontrado via pacote
                        return reject(new Error(`Erro na conversão (${error.message}). Verifique a saída do FFmpeg para mais detalhes.`));
                    }
                    console.log(`Conversão bem-sucedida: ${path.basename(outputMp3Path)}`);
                    resolve(outputMp3Path); // Resolve a promise com o caminho do arquivo MP3 gerado
                });

                // Opcional: Capturar saída padrão do FFmpeg para log detalhado
                ffmpegProcess.stdout.on('data', (data) => {
                    // console.log(`FFmpeg stdout: ${data}`); // Descomente se quiser ver a saída padrão
                });

                ffmpegProcess.stderr.on('data', (data) => {
                    // FFmpeg frequentemente escreve progresso e avisos para stderr
                    console.log(`FFmpeg stderr: ${data}`);
                });
            })
            .catch(reject); // Rejeita se houver erro ao garantir o diretório
    });
}

module.exports = { convertGsmToMp3 };