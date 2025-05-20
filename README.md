# WideVoice Downloader

Uma aplicação cliente-servidor para consultar o histórico de chamadas de um sistema WideVoice através de sua API, permitindo a organização por data, paginação, filtragem, download de gravações em lote (com conversão opcional para MP3 e organização por pastas) e download individual convertido para MP3.

## Funcionalidades

* **Consulta Flexível:** Busca histórico de chamadas por intervalo de data e hora, login e token.
* **Exibição Paginada:** Apresenta os resultados da consulta em uma tabela paginada no frontend. **A paginação é baseada APENAS nos itens que possuem gravação disponível e que correspondem aos filtros aplicados.**
* **Fatiamento Temporal Robusto:** Consulta a API da WideVoice em faixas de data/hora menores para superar a limitação de resultados por requisição (padrão 500), combinando todos os resultados brutos encontrados no período informado no frontend.
* **Filtragem no Frontend:** Permite aplicar filtros dinâmicos por Ramal, Nome do Operador, Origem e Destino sobre os resultados da consulta que possuem gravação, atualizando a exibição da tabela e a paginação. A seção de filtros aparece após a consulta inicial retornar resultados com gravações.
* **Download Individual (MP3):** Permite baixar gravações individuais diretamente da tabela (ícone de download), processando a conversão de GSM para MP3 em um endpoint dedicado no backend. O nome do arquivo baixado é derivado dos dados da gravação.
* **Download em Lote Robusto:** Processa o download de **todas as gravações encontradas na consulta E que correspondem aos filtros atuais aplicados no frontend** através de um componente backend dedicado.
* **Opção de Conversão em Lote:** Permite escolher se as gravações baixadas em lote devem ser convertidas de GSM para MP3 antes de serem empacotadas no arquivo ZIP.
* **Organização em Lote:** As gravações baixadas em lote são organizadas dentro do arquivo ZIP em pastas com a estrutura `YYYY/MM/DD/`, baseada na data da gravação.
* **Status e Feedback:** Exibe mensagens de status no frontend informando sobre o progresso da consulta, downloads, erros e validações.
* **Armazenamento Local:** Salva as configurações de conexão (URL, Login, Token, Datas) no `localStorage` do navegador para conveniência em acessos futuros.

## Pré-requisitos

* **Node.js e npm/yarn:** Para executar o servidor backend.
* **FFmpeg:** **Instalado e acessível no ambiente onde o servidor backend está rodando.** O backend utiliza o FFmpeg para a conversão de arquivos de áudio GSM para MP3. Verifique se o comando `ffmpeg -version` funciona no terminal do backend. Para Windows, o pacote `@ffmpeg-installer/ffmpeg` tenta fornecer o executável, mas pode requerer configuração adicional dependendo do sistema. Para Linux, é comum instalar via gerenciador de pacotes (`sudo apt-get install ffmpeg`).
* **Servidor WideVoice:** Acesso à API de consulta de histórico de chamadas de um sistema WideVoice com login e token válidos.

## Estrutura do Projeto

O projeto é dividido em duas partes principais:

* **`frontend/`**: Contém os arquivos da aplicação web que roda no navegador.
    * `index.html`: A página principal.
    * `style.css`: Estilos da aplicação.
    * `js/`: Pasta contendo os módulos JavaScript.
        * `app.js`: Lógica principal da aplicação, inicialização e event listeners.
        * `constants.js`: Constantes e mensagens utilizadas globalmente.
        * `domUtils.js`: Funções utilitárias para acesso e manipulação básica de elementos DOM.
        * `state.js`: Gerenciamento centralizado do estado da aplicação (resultados brutos, filtrados, paginação).
        * `storageUtils.js`: Funções para salvar e carregar configurações no `localStorage`.
        * `validationUtils.js`: Funções para validar os dados de entrada do formulário.
        * `widevoiceApi.js`: Funções para interagir diretamente com a API WideVoice (busca fatiada de páginas).
        * `backendApi.js`: Funções para interagir com o servidor backend (envio de requisições de download).
        * `fileUtils.js`: Funções utilitárias para manipulação de arquivos no frontend (salvar Blob como arquivo).
        * `uiManager.js`: Funções para gerenciar o estado visual da interface (exibir/ocultar seções, atualizar status, exibir tabela).
        * `filterService.js`: Lógica para aplicar filtros nos resultados da consulta e atualizar a UI relacionada.
        * `paginationService.js`: Lógica para gerenciar a paginação dos resultados filtrados na tabela.
        * `downloadService.js`: Lógica para iniciar os downloads (individual e em lote) chamando o backend.
* **`backend/`**: Contém o servidor Node.js que lida com o download e a conversão.
    * `server.js`: Configuração principal do servidor Express e middlewares.
    * `routes/`: Pasta contendo os módulos de rota.
        * `downloadBatch.js`: Rota e lógica para processar o download em lote e criar o arquivo ZIP.
        * `downloadSingle.js`: Rota e lógica para processar o download individual e a conversão.
    * `converter.js`: Lógica para realizar a conversão de áudio usando FFmpeg.
    * `package.json`: Arquivo de configuração do npm/yarn com as dependências do backend.

## Configuração e Execução

1.  **Clone o repositório** ou baixe os arquivos.
2.  **Instale as dependências do Backend:** Navegue até a pasta `backend/` no seu terminal e execute:
    ```bash
    npm install
    # ou se usar yarn
    # yarn install
    ```
3.  **Instale o FFmpeg:** Certifique-se de que o FFmpeg está instalado e configurado no seu sistema onde o backend será executado.
4.  **Inicie o servidor Backend:** No terminal, dentro da pasta `backend/`, execute:
    ```bash
    node server.js
    ```
    O servidor estará rodando em `http://localhost:3000` por padrão. Mantenha este terminal aberto e o servidor rodando enquanto usa o frontend.

### 2. Configuração e Uso do Frontend

1.  Crie a pasta `js` dentro da pasta principal do projeto.
2.  Crie os arquivos `js/constants.js`, `js/domUtils.js`, `js/storageUtils.js`, `js/validationUtils.js`, `js/backendApi.js`, `js/fileUtils.js` e `js/app.js` dentro da pasta `js`. Cole o código fornecido para cada um deles.
3.  Certifique-se de que os arquivos `index.html` e `style.css` também estejam na pasta principal do projeto.
4.  Edite o seu `index.html` e **adicione a biblioteca FileSaver.js** no `<head>` ou antes do seu script `app.js`. A tag `<script type="module">` para `app.js` deve estar presente.
    ```html
    <script src="[https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js](https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js)"></script>
    <script type="module" src="js/app.js"></script>
    ```
5.  Abra o arquivo `index.html` em um navegador web moderno. É **altamente recomendado** usar um servidor web local simples (como o `http-server`, executando `npx http-server` na pasta do frontend e acessando via `http://localhost:...`) em vez de abrir o arquivo diretamente (`file://...`). Isso evita problemas de segurança relacionados a CORS e módulos JavaScript.
6.  Preencha os campos na interface: **URL do servidor WideVoice**, **Login**, **Token**, **Data Início** e **Data Fim**.
7.  Clique no botão **"Consultar"**.
8.  Os resultados com gravações serão exibidos na tabela, paginados. Navegue pelas páginas se houver muitas gravações.
9.  Clique no link **"🔊 Baixar"** na coluna "Gravação" para fazer o download individual convertido para MP3 via backend.
10. Se gravações forem encontradas, o botão **"Baixar Gravações em Lote"** aparecerá. Marque o checkbox "Converter para MP3" se desejar que os arquivos no ZIP sejam MP3.
11. Clique no botão **"Baixar Gravações em Lote"**. Isso enviará a solicitação para o seu servidor backend.
12. O backend processará o download e a conversão (se solicitada) de todas as gravações encontradas. Uma vez pronto, o frontend lerá o arquivo ZIP recebido e usará `FileSaver.js` para iniciar o download no seu navegador.
13. Use o botão **"Limpar Campos"** para resetar o formulário e os resultados.

## Requisitos

- Um navegador web moderno.
- [Node.js](https://nodejs.org/) e [npm](https://www.npmjs.com/) instalados para rodar o backend.
- Um servidor web local (como `http-server` via `npx http-server`) para servir os arquivos do frontend é recomendado.
- Acesso à API de um sistema WideVoice (requer URL do servidor, login e token válidos).
- Os arquivos do frontend (`index.html`, `style.css`, pasta `js/`) e backend (`server.js`, `package.json`, `package-lock.json`, pasta `node_modules/`, pasta `routes/`, `converter.js`) devem estar organizados em suas respectivas pastas.
- O executável do FFmpeg deve estar acessível para o backend (instalado via `@ffmpeg-installer/ffmpeg`).
- As portas utilizadas (padrão 3000 para o backend, 8080 para `http-server` por padrão) não devem estar bloqueadas por firewall.
- O servidor WideVoice deve permitir requisições HTTP/HTTPS do seu backend para baixar os arquivos de gravação.

## Considerações Importantes

* **Compatibilidade da API:** O funcionamento da busca fatiada e a extração de dados dependem diretamente da estrutura e disponibilidade da API específica do sistema WideVoice (`acao=statusreport`). A estratégia de fatiamento temporal assume um certo comportamento da API ao retornar resultados e timestamps.
* **Dependência do Backend:** A funcionalidade de download em lote e o download individual convertido requerem que o servidor backend esteja rodando e acessível pelo frontend na porta configurada (padrão 3000).
* **Processamento no Backend:** A conversão para MP3 e o zipamento em lote são tarefas que consomem recursos do servidor backend.
* **Recursos Temporários:** O backend utiliza o diretório temporário do sistema para baixar e processar arquivos. Certifique-se de que há espaço disponível e permissões de escrita. A limpeza dos arquivos temporários é feita após cada download/processamento (lote ou individual), mas falhas inesperadas podem deixar arquivos temporários para trás (que devem ser limpos manualmente se ocorrerem erros graves e persistentes).

## Melhorias Futuras Possíveis

-   Adicionar feedback de progresso mais granular durante o processo de download e zipamento no backend (requer comunicação contínua backend -> frontend, ex: WebSockets).
-   Implementar autenticação/autorização no backend para maior segurança.
-   Aprimorar a lógica de fatiamento temporal ou paginação se o comportamento da API Widevoice for diferente do assumido.
-   Otimizar o uso de memória no frontend para downloads em lote muito grandes (talvez transmitindo o ZIP diretamente sem carregar tudo na memória do navegador, se possível com FileSaver.js ou outra técnica).
-   Aprimoramentos na interface de usuário e na responsividade.