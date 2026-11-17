// Carregado antes de todos os testes (bunfig.toml → [test].preload).
// As cores são decididas uma vez, quando src/colors.ts é importado; fixar o
// ambiente aqui faz o resultado ser o mesmo rodando num terminal ou no CI.
process.env.NO_COLOR = "1";
delete process.env.FORCE_COLOR;
delete process.env.FORCE_HYPERLINK;
process.env.DO_NOT_TRACK = "1";
