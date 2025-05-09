# WideVoice Downloader

Uma aplicação cliente-servidor para consultar o histórico de chamadas de um sistema WideVoice através de sua API, permitindo a organização por data, paginação, download de gravações em lote (com conversão opcional para MP3) e download individual convertido para MP3.

## Funcionalidades

-   **Consulta Flexível:** Busca histórico de chamadas por intervalo de data e hora.
-   **Exibição Paginada:** Apresenta os resultados da consulta em uma tabela paginada. **A paginação é baseada APENAS nos itens que possuem gravação disponível.**
-   **Fatiamento Temporal Robusto:** Consulta a API da WideVoice em faixas de data/hora menores para superar a limitação de 500 resultados por requisição, combinando todos os resultados encontrados no período informado.
-   **Filtragem de Gravações:** Exibe e processa apenas as chamadas que possuem gravação disponível na API.
-   **Download Individual (MP3):** Permite baixar gravações individuais diretamente da tabela, processando a conversão de GSM para MP3 no backend. O nome do arquivo baixado é derivado do nome original da gravação.
-   **Download em Lote Robusto:** Processa o download de **todas as gravações encontradas na consulta (não apenas as da página atual)** através de um componente backend.
-   **Opção de Conversão em Lote:** Permite escolher se as gravações baixadas em lote devem ser convertidas de GSM para MP3 antes de serem empacotadas no ZIP.
-   **Organização em Lote:** As gravações baixadas em lote são organizadas em pastas por data (`YYYY/MM/DD/`) dentro do arquivo ZIP. Os nomes dos arquivos no ZIP são descritivos (incluindo data, hora, origem, destino e duração).
-   **Relatório de Processamento:** Inclui um arquivo de log (`processamento_relatorio.log`) dentro do ZIP baixado em lote, detalhando quaisquer falhas de download ou conversão que possam ter ocorrido.
-   **Automação:** Salva e carrega automaticamente as últimas configurações (URL, Login, Token, Datas) no `localStorage` do navegador.
-   **Usabilidade:** Botão "Limpar Campos" para resetar o formulário e resultados.
-   **Feedback Visual:** Indica o estado da consulta e do download em lote (carregando, sucesso, aviso, erro) na interface.
-   **Validação:** Inclui validação básica dos campos de entrada.
-   **Modularização:** Código backend e frontend organizados em módulos para melhor manutenção.

## Como Usar

Esta aplicação consiste em duas partes: um **frontend** (HTML, CSS, JS) e um **backend** (Node.js). Ambas precisam estar configuradas e rodando para a funcionalidade completa.

### 1. Configuração do Backend (Node.js)

1.  Certifique-se de ter [Node.js](https://nodejs.org/) e [npm](https://www.npmjs.com/) instalados.
2.  Crie uma pasta principal para o projeto (ex: `widevoice-downloader`).
3.  Dentro dela, crie a pasta `backend`.
4.  Navegue até a pasta `backend` no terminal.
5.  Inicialize um projeto Node.js e instale as dependências:
    ```bash
    npm init -y
    npm install express cors node-fetch@2 archiver fs-extra uuid @ffmpeg-installer/ffmpeg
    ```
    *(Nota: `node-fetch@2` é usado para compatibilidade com versões mais antigas do Node.js. Se estiver usando Node.js >= 18, pode remover e usar o `Workspace` global nativo, ajustando os arquivos do backend. `@ffmpeg-installer/ffmpeg` instala o executável do FFmpeg)*
6.  Crie o arquivo `backend/converter.js` e cole o código da função `convertGsmToMp3` fornecida.
7.  Crie a pasta `backend/routes`.
8.  Crie o arquivo `backend/routes/downloadBatch.js` e cole o código da lógica de download em lote fornecida.
9.  Crie o arquivo `backend/routes/downloadSingle.js` e cole o código da lógica de download individual fornecida.
10. Crie o arquivo `backend/server.js` e cole o código principal do servidor que importa e utiliza os routers de rota e configura o CORS.
11. No terminal, na pasta `backend`, inicie o servidor backend:
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

## Observações Importantes e Limitações

* **Segurança (Credenciais):** O login e o token são armazenados no `localStorage` do navegador. Esta não é a forma mais segura de armazenar credenciais sensíveis em aplicações de produção. **Use esta ferramenta ciente deste ponto e considere-a mais adequada para uso pessoal, em redes internas controladas, ou com usuários que entendam o risco.**
* **Uso de Memória (Frontend - Download em Lote):** A funcionalidade de download em lote no frontend lê o conteúdo completo do arquivo ZIP para a memória RAM do navegador antes de usar `FileSaver.js`. Para arquivos ZIP muito grandes (muitas gravações ou gravações longas), isso pode causar lentidão ou falhas no navegador.
* **Dependência da API WideVoice:** A ferramenta depende da estrutura e disponibilidade da API específica do sistema WideVoice (`acao=statusreport`). A estratégia de fatiamento temporal assume um certo comportamento da API ao retornar 500 resultados.
* **Dependência do Backend:** A funcionalidade de download em lote e o download individual convertido requerem que o servidor backend esteja rodando e acessível pelo frontend na porta configurada (padrão 3000).
* **Processamento no Backend:** A conversão para MP3 e o zipamento em lote são tarefas intensivas que consomem recursos do servidor backend.
* **Recursos Temporários:** O backend utiliza o diretório temporário do sistema para baixar e processar arquivos. Certifique-se de que há espaço disponível. A limpeza é feita após cada download/processamento, mas falhas inesperadas podem deixar arquivos temporários para trás.

## Melhorias Futuras Possíveis

-   Adicionar feedback de progresso mais granular durante o processo de download e zipamento no backend (requer comunicação contínua backend -> frontend, ex: WebSockets).
-   Implementar autenticação/autorização no backend para maior segurança.
-   Aprimorar a lógica de fatiamento temporal ou paginação se o comportamento da API Widevoice for diferente do assumido.
-   Otimizar o uso de memória no frontend para downloads em lote muito grandes (talvez transmitindo o ZIP diretamente sem carregar tudo na memória do navegador, se possível com FileSaver.js ou outra técnica).
-   Aprimoramentos na interface de usuário e na responsividade.