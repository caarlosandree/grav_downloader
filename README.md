# Consulta de Chamadas WideVoice

Uma aplicação cliente-servidor para consultar o histórico de chamadas de um sistema WideVoice através de sua API, permitindo a organização por data, paginação dos resultados e download das gravações em um arquivo ZIP único.

## Funcionalidades

- **Consulta Flexível:** Busca histórico de chamadas por intervalo de data e hora especificado.
- **Exibição Clara:** Apresenta os resultados da consulta em uma tabela organizada na interface web.
- **Filtragem Inteligente:** Exibe apenas as chamadas que possuem gravação disponível.
- **Paginação de Resultados:** Limita o número de resultados exibidos por página e permite a navegação entre as páginas para gerenciar grandes volumes de dados retornados pela API.
- **Download Individual:** Permite baixar gravações individuais diretamente pela interface.
- **Download em Lote Robusto:** Processa o download de múltiplas gravações através de um componente backend, organizando-as em pastas `YYYY/MM/DD/` e compactando-as em um arquivo ZIP único.
- **Relatório de Falhas Detalhado:** Inclui um arquivo de log (`failed_downloads.log`) dentro do ZIP se houver falhas no download de gravações individuais. Além disso, o frontend exibe detalhes sobre falhas totais ou erros internos do backend, incluindo a lista de downloads falhos quando disponível.
- **Automação:** Salva e carrega automaticamente as últimas configurações (URL, Login, Token, Datas) no `localStorage` do navegador para conveniência.
- **Usabilidade:** Botão "Limpar Campos" para resetar o formulário e resultados.
- **Feedback Visual:** Indica o estado da consulta e do download em lote (carregando, sucesso, erro).
- **Validação:** Inclui validação básica dos campos de entrada para garantir dados corretos.

## Como Usar

Esta aplicação consiste em duas partes: um **frontend** (HTML, CSS, JS) e um **backend** (Node.js). Ambas precisam estar configuradas e rodando para a funcionalidade completa de download em lote.

### 1. Configuração do Backend (Node.js)

1.  Certifique-se de ter [Node.js](https://nodejs.org/) instalado na sua máquina.
2.  Crie uma nova pasta para o backend (ex: `widevoice-backend`).
3.  Dentro dessa pasta, inicialize um projeto Node.js e instale as dependências:
    ```bash
    npm init -y
    npm install express cors node-fetch@2 archiver fs-extra
    ```
4.  Crie o arquivo `server.js` na pasta `widevoice-backend` com o código completo do backend fornecido (a versão mais recente que inclui a lógica de download, organização, zip, limpeza e tratamento de erros detalhado).
5.  No terminal, na pasta `widevoice-backend`, inicie o servidor backend:
    ```bash
    node server.js
    ```
    O servidor estará rodando em `http://localhost:3000` por padrão. Mantenha este terminal aberto e o servidor rodando enquanto usa o frontend.

### 2. Configuração e Uso do Frontend

1.  Certifique-se de ter os arquivos `index.html`, `style.css` e `consulta_chamadas.js` na mesma pasta.
2.  Edite o seu `index.html` e **adicione a biblioteca FileSaver.js** no `<head>` ou antes do seu script `consulta_chamadas.js`:
    ```html
    <script src="[https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js](https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js)"></script>
    <script src="consulta_chamadas.js"></script>
    ```
3.  Certifique-se de que o `consulta_chamadas.js` contém a versão mais recente do código que inclui a paginação, utiliza `response.blob()` e `FileSaver.js` para o download em lote, e o tratamento de erros detalhado do backend.
4.  Abra o arquivo `index.html` em um navegador web moderno. Você pode abrir diretamente (`file://...`) ou usar um servidor web local simples (como o `http-server`, executando `http-server` na pasta do frontend e acessando via `http://localhost:...`). Usar um servidor local é geralmente mais recomendado.
5.  Preencha os campos da interface: **URL do servidor WideVoice**, **Login**, **Token**, **Data Início** e **Data Fim**.
6.  Clique no botão **"Consultar"**.
7.  Os resultados serão exibidos na tabela, paginados conforme a sua implementação. Utilize os controles de paginação (botões, links, etc.) que você adicionou para navegar entre as páginas.
8.  A lista de gravações para o **"Baixar Gravações em Lote"** incluirá *todas* as gravações encontradas pela consulta inicial (não apenas as da página atual), desde que sua implementação de paginação não limite a lista `urlsGravacoesEncontradas`.
9.  Clique no link **"🔊 Baixar"** para download individual (direto da URL do WideVoice).
10. Clique no botão **"Baixar Gravações em Lote"**. Isso enviará a solicitação para o seu servidor backend.
11. O backend processará a solicitação. Uma vez pronto, o frontend lerá o arquivo ZIP recebido e usará `FileSaver.js` para iniciar o download no seu navegador.
12. Se ocorrerem erros durante o processo no backend (falha total, erro interno), o frontend exibirá uma mensagem de erro detalhada na área de status.
13. Use o botão **"Limpar Campos"** para resetar o formulário e os resultados.

## Requisitos

- Um navegador web moderno.
- [Node.js](https://nodejs.org/) instalado para rodar o backend.
- Acesso à API de um sistema WideVoice (requer URL do servidor, login e token válidos).
- Os arquivos do frontend (`index.html`, `style.css`, `consulta_chamadas.js`) e backend (`server.js`, `package.json`, `node_modules/`) devem estar organizados em suas respectivas pastas.
- As portas utilizadas (padrão 3000 para o backend) não devem estar bloqueadas por firewall.
- O servidor WideVoice deve permitir requisições HTTP/HTTPS do seu backend para baixar os arquivos de gravação (semelhante a CORS, mas de servidor para servidor).
- A API do WideVoice utilizada para consulta (`acao=statusreport`) deve suportar parâmetros para paginação (como `limit`, `offset`, `page`, etc.) se a paginação for implementada na consulta da API.

## Observações Importantes e Limitações

* **Segurança (Credenciais):** O login e o token são armazenados no `localStorage` do navegador. Esta não é a forma mais segura de armazenar credenciais sensíveis em aplicações de produção. **Use esta ferramenta ciente deste ponto e considere-a mais adequada para uso pessoal, em redes internas controladas, ou com usuários que entendam o risco.**
* **Uso de Memória (Frontend - Download em Lote):** A funcionalidade de download em lote no frontend lê o conteúdo completo do arquivo ZIP para a memória RAM do navegador antes de usar `FileSaver.js`. Para arquivos ZIP muito grandes (muitas gravações ou gravações longas), isso pode causar lentidão ou falhas no navegador.
* **Dependência da API WideVoice:** A ferramenta depende da estrutura e disponibilidade da API específica do sistema WideVoice.
* **Dependência do Backend:** A funcionalidade de download em lote requer que o servidor backend esteja rodando e acessível pelo frontend.
* **Reportagem de Falhas Parciais:** Quando *algumas* gravações falham, mas *outras* são baixadas com sucesso, os detalhes das falhas individuais são incluídos no arquivo `failed_downloads.log` dentro do arquivo ZIP baixado. O frontend não exibe essas falhas parciais na interface imediatamente após o download iniciar, mas informa sobre falhas totais ou erros gerais do backend.

## Melhorias Futuras Possíveis

- Adicionar feedback de progresso mais granular durante o processo de download e zipamento no backend (requer comunicação contínua backend -> frontend, ex: WebSockets).
- Implementar autenticação/autorização no backend para maior segurança.
- Revisar a estratégia de limpeza de diretórios temporários no backend para maior robustez em cenários de erro complexos.
- Aprimoramentos na interface de usuário e na responsividade.

---
