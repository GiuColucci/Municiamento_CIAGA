# Bibliotecas embutidas no Municiamento.html

| Arquivo | Biblioteca | Versão | Licença | Para quê |
|---|---|---|---|---|
| `xlsx.full.min.js` | SheetJS Community Edition | 0.18.5 | Apache-2.0 | ler a planilha XLSX |
| `jszip.min.js` | JSZip | 3.10.1 | MIT (ou GPL-3.0) | montar o DOCX |
| `jspdf.umd.min.js` | jsPDF | 2.5.2 | MIT | gerar o PDF |
| `pdf.min.js`, `pdf.worker.min.js` | pdf.js (Mozilla) | 3.11.174 | Apache-2.0 | ler a planilha em PDF (roda na própria página, sem worker) |

Baixadas do npm e copiadas sem alteração. Para atualizar: `npm pack <pacote>@<versão>`,
copiar o arquivo de `dist/`, rodar os testes (`node --test web/testes/municiamento.test.cjs`)
e gerar o HTML de novo (`node web/build.mjs`).
