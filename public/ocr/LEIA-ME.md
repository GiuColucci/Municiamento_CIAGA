# OCR do rancho corrido (leitura de foto)

Arquivos de terceiros, hospedados aqui para o app funcionar sem acessar nenhum outro site (a regra de segurança só permite o próprio site):

| Arquivo | O que é | Origem | Licença |
|---|---|---|---|
| `tesseract.min.js`, `worker.min.js` | Tesseract.js 5.1.1 (OCR no navegador) | npm `tesseract.js` | Apache-2.0 |
| `tesseract-core-simd-lstm.wasm.js`, `tesseract-core-lstm.wasm.js` | Motor do Tesseract em WebAssembly (com e sem SIMD) | npm `tesseract.js-core` 5.1.1 | Apache-2.0 |
| `por.traineddata.gz` | Dados do idioma português (`4.0.0_best_int`) | npm `@tesseract.js-data/por` 1.0.0 | Apache-2.0 |

São baixados só quando alguém lê uma **foto** no rancho corrido. Para atualizar, troque os arquivos pelos da mesma versão do pacote npm.
