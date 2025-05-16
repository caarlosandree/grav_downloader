// js/state.js

// --- Variáveis de Estado Centrais ---
// Armazena TODOS os resultados da consulta bruta da API
let allResults = [];
// Armazena objetos { datahora, src, dst, duration, url, nomeoperador, ramal }
// APENAS para itens COM gravação, ANTES de aplicar filtros do usuário.
let urlsGravacoesEncontradas = [];
// Armazena os resultados *APÓS* aplicar os filtros do usuário.
let currentlyFilteredResults = [];

let currentPage = 1;
const resultsPerPage = 20; // Quantidade de gravações por página na tabela


// --- Funções para Acessar e Modificar o Estado ---

export const getState = () => ({
    allResults,
    urlsGravacoesEncontradas,
    currentlyFilteredResults,
    currentPage,
    resultsPerPage
});

export const setAllResults = (results) => {
    allResults = results;
};

export const setUrlsGravacoesEncontradas = (results) => {
    urlsGravacoesEncontradas = results;
};

export const setCurrentlyFilteredResults = (results) => {
    currentlyFilteredResults = results;
};

export const setCurrentPage = (page) => {
    currentPage = page;
};

export const resetState = () => {
    allResults = [];
    urlsGravacoesEncontradas = [];
    currentlyFilteredResults = [];
    currentPage = 1;
};